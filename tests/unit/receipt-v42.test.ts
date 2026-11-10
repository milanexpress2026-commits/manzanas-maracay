import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildHabitualCatalogOptions,
  quickReceiptSchema,
  receiptSchema,
  formatReceiptNumber,
  confirmedPresentationsReady,
  CATALOG_TEMPLATES,
  habitualPacking,
  habitualPackingIssue,
  type ReceiptPacking,
  type Catalog,
  type Configuration,
} from '../../packages/domain/src/index';
const id = '00000000-0000-4000-8000-000000000001';
const empty: Catalog = { fruits: [], varieties: [], calibers: [], configurations: [] };
const product = {
  templateId: 'apple_traditional',
  templateVersion: 'v4.2',
  varietyName: 'Gala',
  caliberLabel: '100',
};
const cost = { kind: 'entered', unitCostUsd: '25', accepted: true };
const request = { schemaVersion: 2, lines: [{ product, boxes: 2, cost }] };

describe('recepción rápida V4.2', () => {
  it('expone catálogo virtual completo sin mutar maestros ni inventar stock/precios', () => {
    const options = buildHabitualCatalogOptions(empty, 'v4.2');
    expect(empty).toEqual({ fruits: [], varieties: [], calibers: [], configurations: [] });
    expect(options.templateVersion).toBe('v4.2');
    expect(
      options.options.every((o) => o.configurationId === null && o.packingVersion === null),
    ).toBe(true);
    const apples = options.groups.find((g) => g.id === 'apple_traditional')!.options;
    for (const caliber of [
      '80',
      '88',
      '100',
      '113',
      '125',
      '135',
      '150',
      '163',
      '175',
      '198',
      '216',
    ])
      expect(apples.some((o) => o.caliberLabel === caliber)).toBe(true);
    for (const caliber of ['70', '80', '90', '100', '110', '120', '135'])
      expect(
        options.groups
          .find((g) => g.id === 'pear')!
          .options.some((o) => o.caliberLabel === caliber),
      ).toBe(true);
    expect(options.groups.find((g) => g.id === 'grape')!.options.map((o) => o.varietyName)).toEqual(
      ['Roja', 'Morada', 'Verde'],
    );
    for (const fruit of ['Ciruela', 'Nectarina', 'Naranja', 'Mandarina']) {
      const option = options.options.find((o) => o.fruitName === fruit)!;
      expect(option.needsPresentation).toBe(true);
      expect(option.suggestedPacking).toBeNull();
    }
    expect(JSON.stringify(options)).not.toMatch(/unitCostUsd|promoUsd|regularUsd|receivedBoxes/);
  });
  it('precarga la corrección de Gala 100=5; no inventa medias ni blíster en otras familias', () => {
    const options = buildHabitualCatalogOptions(empty, 'v4.2').options;
    for (const [caliber, count] of [
      ['88', 4],
      ['100', 5],
      ['113', 5],
    ] as const)
      expect(
        options.find((o) => o.templateId === 'apple_traditional' && o.caliberLabel === caliber)
          ?.suggestedPacking,
      ).toMatchObject({
        blistersPerBox: count,
        allowedPresentations: ['box', 'blister'],
        halfPreparation: 'pending',
      });
    for (const option of options.filter((o) => o.templateId !== 'apple_traditional')) {
      expect(option.suggestedPacking?.blistersPerBox ?? null).toBeNull();
      if (option.suggestedPacking)
        expect(
          confirmedPresentationsReady({
            ...option.suggestedPacking,
            confirmationStatus: 'confirmed',
          }),
        ).toBe(true);
    }
    expect(
      options.find((o) => o.templateId === 'apple_bulk' && o.caliberLabel === '232')
        ?.suggestedPacking?.allowedPresentations,
    ).toEqual(['box', 'half_box']);
    expect(options.find((o) => o.templateId === 'kiwi')?.suggestedPacking?.boxWeightKg).toBe('10');
  });
  it('reutiliza la identidad exacta, conserva empaque discrepante y no fusiona Manzana Gala', () => {
    const config: Configuration = {
      id,
      variantId: id,
      fruitId: id,
      varietyId: id,
      caliberId: id,
      fruit: 'MANZANA',
      variety: 'GALA',
      caliber: '100',
      commercialLine: 'Tradicional',
      packingModel: 'blister',
      halfPreparation: 'pending',
      allowedPresentations: ['box', 'blister'],
      blistersPerBox: 4,
      boxWeightKg: null,
      confirmationStatus: 'confirmed',
      version: 3,
      prices: [],
      notes: '',
    };
    const catalog: Catalog = {
      fruits: [
        { id, name: 'MANZANA' },
        { id: 'historical', name: 'Manzana Gala' },
      ],
      varieties: [
        { id, fruitId: id, name: 'GALA' },
        { id: 'lady', fruitId: id, name: 'Lady' },
      ],
      calibers: [{ id, fruitId: id, label: '100' }],
      configurations: [config],
    };
    const before = structuredClone(catalog);
    const options = buildHabitualCatalogOptions(catalog, 'v4.2').options;
    const found = options.find((o) => o.configurationId === id)!;
    expect(found.packingDiscrepancy).toBe(true);
    expect(found.currentPacking?.blistersPerBox).toBe(4);
    expect(found.suggestedPacking?.blistersPerBox).toBe(5);
    expect(found.product).toEqual({ configurationId: id, expectedPackingVersion: 3 });
    expect(options.some((o) => o.varietyName === 'Lady')).toBe(true);
    expect(options.some((o) => o.varietyName === 'Pink Lady')).toBe(true);
    expect(catalog).toEqual(before);
  });
  it('marca discrepancias históricas de modelo, peso y presentaciones sin cambiar el registro', () => {
    const template = CATALOG_TEMPLATES.find((t) => t.id === 'kiwi')!;
    const expected = habitualPacking(template, null, null)!;
    for (const change of [
      { boxWeightKg: '11' },
      { allowedPresentations: ['box'] },
      { packingModel: 'whole', halfPreparation: 'none', allowedPresentations: ['box'] },
    ] as Partial<ReceiptPacking>[]) {
      const packing = { ...expected, ...change };
      const config: Configuration = {
        id,
        variantId: id,
        fruitId: id,
        varietyId: null,
        caliberId: null,
        fruit: 'Kiwi',
        variety: null,
        caliber: null,
        commercialLine: 'Caja 10 kg',
        ...packing,
        confirmationStatus: 'confirmed',
        version: 7,
        prices: [],
        notes: 'Histórico',
      };
      const catalog: Catalog = {
        ...empty,
        fruits: [{ id, name: 'Kiwi' }],
        configurations: [config],
      };
      const original = structuredClone(catalog);
      const option = buildHabitualCatalogOptions(catalog, 'v4.2').options.find(
        (row) => row.configurationId === id,
      )!;
      expect(option.packingDiscrepancy).toBe(true);
      expect(option.currentPacking).toEqual(packing);
      expect(option.product).toEqual({ configurationId: id, expectedPackingVersion: 7 });
      expect(catalog).toEqual(original);
    }
  });
  it('acepta peso equivalente y capacidades de pera revisadas sin aplicar conteos de manzana', () => {
    const kiwi = CATALOG_TEMPLATES.find((t) => t.id === 'kiwi')!;
    expect(
      habitualPackingIssue(kiwi, null, null, {
        ...habitualPacking(kiwi, null, null)!,
        boxWeightKg: '10.000',
      }),
    ).toBeNull();
    const pear = CATALOG_TEMPLATES.find((t) => t.id === 'pear')!;
    const packing: ReceiptPacking = {
      packingModel: 'blister',
      halfPreparation: 'counted',
      allowedPresentations: ['box', 'half_box', 'blister'],
      blistersPerBox: 6,
      boxWeightKg: null,
    };
    expect(habitualPackingIssue(pear, 'Packcam', '100', packing)).toBeNull();
    expect(
      habitualPackingIssue(pear, 'Packcam', '100', { ...packing, blistersPerBox: null }),
    ).toContain('empaque habitual');
    expect(
      habitualPackingIssue(pear, 'Packcam', '100', { ...packing, halfPreparation: 'pending' }),
    ).toContain('empaque habitual');
  });
  it('omite proveedor, documento y reloj sin generar valores que cambien el hash de reintento', () => {
    const parsed = quickReceiptSchema.parse(request);
    expect(parsed.supplierId).toBeNull();
    expect(parsed.reference).toBeNull();
    expect(parsed.receivedAt).toBeUndefined();
    expect(parsed.lines[0]!.cost.unitCostUsd).toBe('25.0000');
    expect(quickReceiptSchema.parse(request)).toEqual(parsed);
    expect(quickReceiptSchema.safeParse({ ...request, receiptNumber: 'R-1' }).success).toBe(false);
    expect(
      quickReceiptSchema.safeParse({ ...request, supplierId: 'Proveedor genérico' }).success,
    ).toBe(false);
  });
  it('cada costo positivo necesita aceptación y el anterior conserva su fuente', () => {
    for (const bad of [
      undefined,
      { ...cost, accepted: false },
      { ...cost, unitCostUsd: '0' },
      { ...cost, unitCostUsd: '-1' },
      { ...cost, kind: 'previous' },
    ])
      expect(
        quickReceiptSchema.safeParse({ ...request, lines: [{ product, boxes: 1, cost: bad }] })
          .success,
      ).toBe(false);
    const parsed = quickReceiptSchema.parse({
      ...request,
      lines: [
        {
          product,
          boxes: 1,
          cost: { kind: 'previous', sourceLotId: id, unitCostUsd: '27.1234', accepted: true },
        },
      ],
    });
    expect(parsed.lines[0]!.cost).toEqual({
      kind: 'previous',
      sourceLotId: id,
      unitCostUsd: '27.1234',
      accepted: true,
    });
  });
  it('excepción de lote exige motivo/confirmación; empaque no habilita medias desconocidas', () => {
    const base = { product, boxes: 1, cost };
    expect(
      quickReceiptSchema.safeParse({
        ...request,
        lines: [
          {
            ...base,
            blisterOverride: {
              blistersPerBox: 5,
              confirmed: true,
              reason: 'Caja excepcional real',
            },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      quickReceiptSchema.safeParse({
        ...request,
        lines: [{ ...base, blisterOverride: { blistersPerBox: 5 } }],
      }).success,
    ).toBe(false);
    const packing = {
      packingModel: 'blister',
      halfPreparation: 'pending',
      allowedPresentations: ['box', 'half_box', 'blister'],
      blistersPerBox: 4,
      boxWeightKg: null,
      confirmed: true,
    };
    expect(
      quickReceiptSchema.safeParse({ ...request, lines: [{ ...base, packing }] }).success,
    ).toBe(false);
    expect(
      quickReceiptSchema.safeParse({
        ...request,
        lines: [{ ...base, packing: { ...packing, allowedPresentations: ['box', 'blister'] } }],
      }).success,
    ).toBe(true);
  });
  it('preserva el DTO antiguo y su hash, incluyendo costos históricos cero sin reinterpretarlos', () => {
    const body = {
      supplierId: id,
      reference: 'HISTORICAL',
      receivedAt: '2026-11-05T12:00:00Z',
      lines: [{ configurationId: id, boxes: 1, unitCostUsd: '0' }],
    };
    const expected = {
      supplierId: id,
      reference: 'HISTORICAL',
      receivedAt: '2026-11-05T12:00:00Z',
      notes: '',
      isDemo: false,
      lines: [
        {
          configurationId: id,
          boxes: 1,
          unitCostUsd: '0.0000',
          priceAction: 'keep',
          prices: [],
          notes: '',
        },
      ],
    };
    const hash = (data: unknown) =>
      createHash('sha256')
        .update(JSON.stringify({ kind: 'receipt', data, actor: id }))
        .digest('hex');
    expect(hash(receiptSchema.parse(body))).toBe(hash(expected));
  });
  it('el número interno no trunca secuencias grandes ni acepta valores externos inválidos', () => {
    expect(formatReceiptNumber('1')).toBe('R-00000001');
    expect(formatReceiptNumber(123456789n)).toBe('R-123456789');
    expect(() => formatReceiptNumber('0')).toThrow();
    expect(() => formatReceiptNumber('1.2')).toThrow();
  });
});
