import { describe, expect, it } from 'vitest';
import {
  buildHabitualCatalogOptions,
  type Catalog,
  type HabitualCatalogOption,
} from '../../packages/domain/src/index';
import {
  buildQuickReceipt,
  emptyReceiptDraft,
  productSearchMatches,
  receiptDraftSchema,
  receiptLine,
  receiptOptionChanged,
  revisePacking,
} from '../../apps/web/src/lib/receipt-flow';
import {
  createPendingReceipt,
  canEditAfterReceiptResponse,
  deviceScope,
  emptyPreferences,
  readPreferences,
  receiptFingerprint,
  rememberProducts,
  verifyPendingReceipt,
  writePreferences,
} from '../../apps/web/src/lib/receipt-storage';

const empty: Catalog = { fruits: [], varieties: [], calibers: [], configurations: [] };
const options = buildHabitualCatalogOptions(empty).options;
const apple = options.find(
  (option) =>
    option.templateId === 'apple_traditional' &&
    option.varietyName === 'Gala' &&
    option.caliberLabel === '100',
)!;
function draftFor(option: HabitualCatalogOption = apple) {
  const draft = emptyReceiptDraft('production:owner-id');
  draft.lines = [{ ...receiptLine(option), boxes: '2' }];
  return draft;
}

describe('recepción simple: cantidad y revisión explícitas', () => {
  it('ofrece Gala 100 con cinco blísteres, una caja y sin importes; no requiere proveedor ni referencia', () => {
    const line = receiptLine(apple);
    expect(line.packing?.blistersPerBox).toBe(5);
    expect(line.boxes).toBe('1');
    const body = buildQuickReceipt(draftFor(), options);
    expect(body).toMatchObject({ schemaVersion: 3, supplierId: null, reference: null });
    expect(body.receivedAt).toBeUndefined();
    expect(body.lines[0].boxes).toBe(2);
    expect(body.lines[0].packing).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/cost|price/i);
  });
  it('requiere una cantidad entera positiva sin inventar costos ni precios', () => {
    for (const boxes of ['0', '-1', '1.5', '']) {
      const draft = draftFor();
      draft.lines[0].boxes = boxes;
      expect(() => buildQuickReceipt(draft, options)).toThrow();
    }
  });
  it('migra el borrador editable V2, conservando exactamente un comando anterior pendiente', async () => {
    const previousBody = {
      schemaVersion: 2,
      supplierId: null,
      reference: null,
      notes: '',
      lines: [
        {
          product: apple.product,
          boxes: 2,
          cost: { kind: 'entered', unitCostUsd: '25.0000', accepted: true },
          priceAction: 'keep',
          prices: [],
        },
      ],
    };
    const pending = await createPendingReceipt(previousBody);
    const legacy = {
      ...draftFor(),
      version: 2,
      pending,
      lines: [
        {
          ...draftFor().lines[0],
          cost: '25.00',
          costSource: 'entered',
          previousCost: null,
          priceAction: 'replace',
          prices: [{ presentation: 'box', promoUsd: '40' }],
        },
      ],
    };
    const reopened = receiptDraftSchema.parse(JSON.parse(JSON.stringify(legacy)));
    expect(reopened.version).toBe(3);
    expect(reopened.pending).toEqual(pending);
    expect(await verifyPendingReceipt(reopened.pending)).toBe(true);
    expect(JSON.stringify(reopened.lines)).not.toMatch(/cost|price/i);
    expect(JSON.parse(reopened.pending!.body)).toEqual(previousBody);
  });
  it('exige unidad comercial expresa para alimentos y conserva la etiqueta elegida', () => {
    const food = options.find((option) => option.templateId === 'raisins')!;
    const draft = draftFor(food);
    expect(draft.lines[0].packing).toBeNull();
    expect(() => buildQuickReceipt(draft, options)).toThrow();
    draft.lines[0] = revisePacking(draft.lines[0], {
      packingModel: 'whole',
      halfPreparation: 'none',
      allowedPresentations: ['box'],
      blistersPerBox: null,
      boxWeightKg: null,
      commercialUnitLabel: 'Envase sellado 500 g',
    });
    draft.lines[0].packingConfirmed = true;
    expect(buildQuickReceipt(draft, options).lines[0].packing).toMatchObject({
      confirmed: true,
      commercialUnitLabel: 'Envase sellado 500 g',
      packingModel: 'whole',
    });
  });
  it('no sustituye una versión guardada al reabrir luego de otro cambio de empaque', () => {
    const original: HabitualCatalogOption = {
      ...apple,
      configurationId: '20000000-0000-4000-8000-000000000002',
      confirmationStatus: 'confirmed',
      packingVersion: 3,
      currentPacking: { ...apple.suggestedPacking!, blistersPerBox: 4 },
      product: {
        configurationId: '20000000-0000-4000-8000-000000000002',
        expectedPackingVersion: 3,
      },
    };
    const draft = receiptDraftSchema.parse(JSON.parse(JSON.stringify(draftFor(original))));
    const changed: HabitualCatalogOption = {
      ...original,
      packingVersion: 4,
      product: { configurationId: original.configurationId!, expectedPackingVersion: 4 },
      currentPacking: { ...original.currentPacking!, blistersPerBox: 5 },
    };
    expect(receiptOptionChanged(draft.lines[0], changed)).toBe(true);
    expect(() => buildQuickReceipt(draft, [changed])).toThrow('empaque del producto 1 cambió');
    expect(draft.lines[0].product).toEqual(original.product);
    expect(draft.lines[0]).toMatchObject({
      boxes: '2',
      packing: { blistersPerBox: 4 },
    });
  });
  it('exige confirmar una presentación desconocida y cualquier excepción de lote', () => {
    const option = options.find((option) => option.templateId === 'plum')!;
    const draft = draftFor(option);
    expect(() => buildQuickReceipt(draft, options)).toThrow('Confirma la presentación');
    draft.lines[0] = revisePacking(draft.lines[0], {
      packingModel: 'whole',
      halfPreparation: 'none',
      allowedPresentations: ['box'],
      blistersPerBox: null,
      boxWeightKg: null,
    });
    expect(() => buildQuickReceipt(draft, options)).toThrow('Confirma la presentación');
    draft.lines[0].packingConfirmed = true;
    expect(buildQuickReceipt(draft, options).lines[0].packing?.confirmed).toBe(true);
    const appleDraft = draftFor();
    appleDraft.lines[0].blisterOverride = '6';
    appleDraft.lines[0].overrideReason = 'Empaque distinto comprobado en este lote';
    expect(() => buildQuickReceipt(appleDraft, options)).toThrow('Confirma la excepción');
    appleDraft.lines[0].overrideConfirmed = true;
    expect(buildQuickReceipt(appleDraft, options).lines[0].blisterOverride?.blistersPerBox).toBe(6);
    expect(apple.suggestedPacking?.blistersPerBox).toBe(5);
  });
  it('busca palabras naturales aunque el nombre use separadores o acentos', () => {
    expect(productSearchMatches('Manzana · Gala · 100', 'Tradicional', 'Gala 100')).toBe(true);
    expect(productSearchMatches('Manzana · Roja normal · 113', '', 'roja 113')).toBe(true);
    expect(productSearchMatches('Uva · Morada', 'Caja completa', 'uva verde')).toBe(false);
    expect(productSearchMatches('Mandarina', 'Confirmar presentación', 'presentacion')).toBe(true);
  });
});

describe('continuidad local sin autenticación guardada', () => {
  it.each([401, 403, 404, 408, 429, 500, 503])(
    'conserva la confirmación incierta tras HTTP %i, incluso si hay que volver a entrar',
    async (status) => {
      const pending = await createPendingReceipt(buildQuickReceipt(draftFor(), options));
      const reopened = receiptDraftSchema.parse(
        JSON.parse(JSON.stringify({ ...draftFor(), pending })),
      );
      if (canEditAfterReceiptResponse(status)) reopened.pending = null;
      expect(reopened.pending).toEqual(pending);
      expect(await verifyPendingReceipt(reopened.pending)).toBe(true);
    },
  );
  it.each([400, 409, 422])('permite corregir solamente un rechazo definitivo HTTP %i', (status) => {
    expect(canEditAfterReceiptResponse(status)).toBe(true);
  });
  it('conserva cuerpo, huella y clave del mismo comando tras reabrir; rechaza manipulación', async () => {
    const body = buildQuickReceipt(draftFor(), options);
    const pending = await createPendingReceipt(body);
    const reopened = receiptDraftSchema.parse(
      JSON.parse(JSON.stringify({ ...draftFor(), pending })),
    );
    expect(await verifyPendingReceipt(reopened.pending)).toBe(true);
    expect(reopened.pending).toEqual(pending);
    expect(
      await verifyPendingReceipt({
        ...pending,
        body: pending.body.replace('\"boxes\":2', '\"boxes\":3'),
      }),
    ).toBe(false);
    expect(await receiptFingerprint(pending.body)).toBe(pending.hash);
    expect(JSON.stringify(reopened)).not.toMatch(/password|cookie|token|authorization/i);
  });
  it('aísla preferencias por usuario/entorno y limita los recientes sin crear datos', () => {
    const rows = new Map<string, string>();
    const storage = {
      getItem: (key: string) => rows.get(key) ?? null,
      setItem: (key: string, value: string) => {
        rows.set(key, value);
      },
      removeItem: (key: string) => {
        rows.delete(key);
      },
    };
    const scope = deviceScope('production', 'owner');
    const preferences = rememberProducts(
      { ...emptyPreferences(), favorites: ['gala'], hidden: ['uva'] },
      Array.from({ length: 30 }, (_, i) => `product-${i}`),
    );
    writePreferences(storage, scope, preferences);
    expect(readPreferences(storage, scope)).toEqual(preferences);
    expect(preferences.recent).toHaveLength(20);
    expect(readPreferences(storage, deviceScope('staging', 'owner'))).toEqual(emptyPreferences());
    expect(readPreferences(storage, deviceScope('production', 'another'))).toEqual(
      emptyPreferences(),
    );
  });
});
