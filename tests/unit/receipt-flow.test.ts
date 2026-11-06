import { describe, expect, it } from 'vitest';
import {
  buildHabitualCatalogOptions,
  type Catalog,
  type HabitualCatalogOption,
} from '../../packages/domain/src/index';
import {
  acceptPreviousCost,
  buildQuickReceipt,
  emptyReceiptDraft,
  productSearchMatches,
  receiptDraftSchema,
  receiptLine,
  receiptOptionChanged,
  receiptTotal,
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
  draft.lines = [{ ...receiptLine(option), cost: '25,00', boxes: '2' }];
  return draft;
}

describe('recepción rápida: revisión y costo explícitos', () => {
  it('ofrece 100 con cuatro blísteres y costo vacío; revisar no requiere proveedor ni referencia', () => {
    const line = receiptLine(apple);
    expect(line.packing?.blistersPerBox).toBe(4);
    expect(line.cost).toBe('');
    expect(line.previousCost).toBeNull();
    expect(() => buildQuickReceipt({ ...draftFor(), lines: [line] }, options)).toThrow();
    const body = buildQuickReceipt(draftFor(), options);
    expect(body).toMatchObject({ schemaVersion: 2, supplierId: null, reference: null });
    expect(body.receivedAt).toBeUndefined();
    expect(body.lines[0]).toMatchObject({
      cost: { kind: 'entered', unitCostUsd: '25.0000', accepted: true },
      priceAction: 'keep',
      prices: [],
    });
    expect(body.lines[0].packing).toBeUndefined();
  });
  it('no usa el costo anterior hasta pulsar aceptar y conserva el lote fuente exacto', () => {
    const previous = {
      sourceLotId: '20000000-0000-4000-8000-000000000001',
      unitCostUsd: '27.0000',
      receivedAt: '2026-11-05T15:00:00.000Z',
    };
    const draft = draftFor();
    draft.lines[0] = { ...draft.lines[0], cost: '', previousCost: previous };
    expect(() => buildQuickReceipt(draft, options)).toThrow();
    draft.lines[0] = acceptPreviousCost(draft.lines[0], previous);
    expect(buildQuickReceipt(draft, options).lines[0].cost).toEqual({
      kind: 'previous',
      ...{ sourceLotId: previous.sourceLotId, unitCostUsd: previous.unitCostUsd },
      accepted: true,
    });
    expect(receiptTotal(draft.lines)).toBe('54.0000');
  });
  it('rechaza costo cero y no pierde precisión de cuatro decimales', () => {
    const draft = draftFor();
    draft.lines[0].cost = '0';
    expect(() => buildQuickReceipt(draft, options)).toThrow();
    draft.lines[0].cost = '0,3333';
    draft.lines[0].boxes = '3';
    expect(receiptTotal(draft.lines)).toBe('0.9999');
  });
  it('no sustituye una versión guardada al reabrir luego de otro cambio de empaque', () => {
    const original: HabitualCatalogOption = {
      ...apple,
      configurationId: '20000000-0000-4000-8000-000000000002',
      confirmationStatus: 'confirmed',
      packingVersion: 3,
      currentPacking: apple.suggestedPacking,
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
      cost: '25,00',
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
    expect(apple.suggestedPacking?.blistersPerBox).toBe(4);
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
      await verifyPendingReceipt({ ...pending, body: pending.body.replace('25.00', '0.01') }),
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
