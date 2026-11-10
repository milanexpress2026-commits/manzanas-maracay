import { describe, it, expect } from 'vitest';
import {
  CATALOG_TEMPLATES,
  getCatalogPreparationDefaults,
  catalogPreparationInputSchema,
  catalogPreparationSchema,
  catalogConfigurationBatchSchema,
  previewCatalogPreparation,
  suggestedBlistersPerBox,
  receiptSchema,
  receiptPackingConfirmationSchema,
  type Catalog,
} from '../../packages/domain/src/index';

const id = '00000000-0000-4000-8000-000000000001';
const empty: Catalog = { fruits: [], varieties: [], calibers: [], configurations: [] };
const packing = {
  packingModel: 'blister' as const,
  halfPreparation: 'pending' as const,
  allowedPresentations: ['box', 'half_box', 'blister'],
  blistersPerBox: null,
  boxWeightKg: null,
  confirmationStatus: 'pending' as const,
};
const confirmation = {
  expectedVersion: 1,
  confirmed: true as const,
  packingModel: 'blister' as const,
  halfPreparation: 'counted' as const,
  allowedPresentations: ['box', 'half_box', 'blister'],
  blistersPerBox: 5,
  boxWeightKg: null,
};

describe('preparación comercial explícita V4', () => {
  it('prepara ocho maestros compartidos y solo cuatro borradores concretos, sin combinaciones cartesianas', () => {
    const input = catalogPreparationInputSchema.parse(getCatalogPreparationDefaults());
    const preview = previewCatalogPreparation(input, empty);
    expect(preview.created).toEqual({ fruits: 8, varieties: 10, calibers: 19, configurations: 4 });
    const apple = input.fruits.find((f) => f.name === 'Manzana')!;
    expect(apple.varieties).toEqual(['Gala', 'Roja normal', 'Verde', 'Pink Lady', 'Amarilla']);
    expect(apple.calibers).toContain('216');
    expect(apple.drafts).toEqual([]);
    expect(input.fruits.find((f) => f.name === 'Pera')!.drafts).toEqual([]);
    expect(input.fruits.find((f) => f.name === 'Mandarina')).toEqual({
      name: 'Mandarina',
      varieties: [],
      calibers: [],
      drafts: [],
    });
    expect(
      input.fruits
        .flatMap((f) => f.drafts)
        .every((d) => d.confirmationStatus === 'pending' && d.blistersPerBox === null),
    ).toBe(true);
    expect(
      CATALOG_TEMPLATES.find((t) => t.id === 'apple_bulk')!.packing!.allowedPresentations,
    ).toEqual(['box', 'half_box']);
    expect(input.fruits.find((f) => f.name === 'Kiwi')!.drafts[0]).toMatchObject({
      varietyName: null,
      caliberLabel: null,
      boxWeightKg: '10',
    });
    expect(
      input.fruits.find((f) => f.name === 'Uva')!.drafts.map((d) => d.allowedPresentations),
    ).toEqual([['box'], ['box'], ['box']]);
  });
  it('ediciones y exclusiones se reflejan sin modificar futuras vistas por defecto', () => {
    const input = getCatalogPreparationDefaults();
    input.fruits = input.fruits.filter((f) => f.name === 'Kiwi');
    input.fruits[0]!.name = 'Kiwi revisado';
    input.fruits[0]!.drafts[0]!.boxWeightKg = '12';
    expect(previewCatalogPreparation(input, empty).created).toEqual({
      fruits: 1,
      varieties: 0,
      calibers: 0,
      configurations: 1,
    });
    expect(
      getCatalogPreparationDefaults().fruits.find((f) => f.name === 'Kiwi')!.drafts[0]!.boxWeightKg,
    ).toBe('10');
  });
  it('reutiliza nombres equivalentes de la misma fruta sin convertir Lady en Pink Lady', () => {
    const input = {
      fruits: [
        { name: ' manzana ', varieties: ['Gala', 'Pink Lady'], calibers: ['100'], drafts: [] },
      ],
    };
    const preview = previewCatalogPreparation(catalogPreparationInputSchema.parse(input), {
      ...empty,
      fruits: [{ id, name: 'Manzana' }],
      varieties: [
        { id, fruitId: id, name: 'GALA' },
        { id: 'lady', fruitId: id, name: 'Lady' },
      ],
      calibers: [{ id, fruitId: id, label: '100' }],
    });
    expect(preview.created).toEqual({ fruits: 0, varieties: 1, calibers: 0, configurations: 0 });
    expect(preview.reused).toEqual({ fruits: 1, varieties: 1, calibers: 1, configurations: 0 });
    expect(preview.fruits[0]!.varieties[1]!.action).toBe('create');
  });
  it('exige confirmación explícita y rechaza stock/precios o confirmación implícita en borradores', () => {
    const defaults = getCatalogPreparationDefaults();
    expect(catalogPreparationSchema.safeParse(defaults).success).toBe(false);
    expect(
      catalogPreparationSchema.safeParse({ ...defaults, confirmed: true, stock: 5 }).success,
    ).toBe(false);
    defaults.fruits.find((f) => f.name === 'Kiwi')!.drafts[0]!.confirmationStatus =
      'confirmed' as 'pending';
    expect(catalogPreparationSchema.safeParse({ ...defaults, confirmed: true }).success).toBe(
      false,
    );
  });
  it('rechaza nombres repetidos, referencias fuera de revisión y borradores blisteados sin identidad', () => {
    expect(
      catalogPreparationInputSchema.safeParse({
        fruits: [{ name: 'Pera', varieties: ['Forelle', ' forelle '], calibers: [], drafts: [] }],
      }).success,
    ).toBe(false);
    const draft = {
      ...packing,
      commercialLine: 'Tradicional',
      notes: '',
      varietyName: 'Gala',
      caliberLabel: '100',
    };
    expect(
      catalogPreparationInputSchema.safeParse({
        fruits: [{ name: 'Manzana', varieties: ['Gala'], calibers: [], drafts: [draft] }],
      }).success,
    ).toBe(false);
    expect(
      catalogPreparationInputSchema.safeParse({
        fruits: [
          {
            name: 'Manzana',
            varieties: [],
            calibers: [],
            drafts: [{ ...draft, varietyName: null, caliberLabel: null }],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it('el alta rápida requiere combinaciones concretas pendientes, sin duplicar ni confirmar todas', () => {
    const row = { ...packing, fruitId: id, varietyId: id, caliberId: id };
    expect(
      catalogConfigurationBatchSchema.safeParse({ confirmed: true, configurations: [row] }).success,
    ).toBe(true);
    expect(
      catalogConfigurationBatchSchema.safeParse({ confirmed: true, configurations: [row, row] })
        .success,
    ).toBe(false);
    expect(
      catalogConfigurationBatchSchema.safeParse({
        confirmed: true,
        configurations: [{ ...row, caliberId: null }],
      }).success,
    ).toBe(false);
    expect(
      catalogConfigurationBatchSchema.safeParse({
        confirmed: true,
        configurations: [{ ...row, confirmationStatus: 'confirmed' }],
      }).success,
    ).toBe(false);
  });
  it('aplica cinco blíster a las cuatro manzanas 100 confirmadas y conserva las demás identidades', () => {
    for (const variety of ['Gala', 'Roja normal', 'Verde', 'Amarilla', 'Pink Lady', 'Lady']) {
      expect(suggestedBlistersPerBox('Manzana', variety, '80')).toBe(4);
      expect(suggestedBlistersPerBox('Manzana', variety, '100')).toBe(
        ['Pink Lady', 'Lady'].includes(variety) ? 4 : 5,
      );
      expect(suggestedBlistersPerBox('Manzana', variety, '113')).toBe(5);
    }
    expect(suggestedBlistersPerBox('Pera', 'Packcam', '135')).toBeNull();
    expect(suggestedBlistersPerBox('Manzana', 'Gala', '88/100')).toBeNull();
    expect(suggestedBlistersPerBox('Manzana', 'Gala', '100', 'Granel', 'halves')).toBeNull();
    expect(suggestedBlistersPerBox('Manzana', null, '100')).toBe(4);
    expect(suggestedBlistersPerBox('Manzana', 'Otra variedad', '100')).toBe(4);
    expect(suggestedBlistersPerBox('Manzana', ' ROJA ', '100')).toBe(5);
  });
});

describe('confirmación de empaque al recibir', () => {
  it('requiere revisión explícita, versión y capacidades conocidas; caja sola puede confirmarse sin blíster', () => {
    expect(receiptPackingConfirmationSchema.safeParse(confirmation).success).toBe(true);
    expect(
      receiptPackingConfirmationSchema.safeParse({ ...confirmation, confirmed: false }).success,
    ).toBe(false);
    expect(
      receiptPackingConfirmationSchema.safeParse({ ...confirmation, expectedVersion: 0 }).success,
    ).toBe(false);
    expect(
      receiptPackingConfirmationSchema.safeParse({ ...confirmation, blistersPerBox: null }).success,
    ).toBe(false);
    expect(
      receiptPackingConfirmationSchema.safeParse({ ...confirmation, halfPreparation: 'pending' })
        .success,
    ).toBe(false);
    expect(
      receiptPackingConfirmationSchema.safeParse({
        ...confirmation,
        halfPreparation: 'pending',
        blistersPerBox: null,
        allowedPresentations: ['box'],
      }).success,
    ).toBe(true);
  });
  it('rechaza confirmaciones contradictorias para el mismo producto y conserva confirmación idéntica multinea', () => {
    const line = {
      configurationId: id,
      boxes: 1,
      unitCostUsd: '25',
      packingConfirmation: confirmation,
    };
    const base = { supplierId: id, reference: 'DEMO', receivedAt: '2026-11-05T12:00:00Z' };
    expect(receiptSchema.safeParse({ ...base, lines: [line, line] }).success).toBe(true);
    expect(
      receiptSchema.safeParse({
        ...base,
        lines: [line, { ...line, packingConfirmation: { ...confirmation, blistersPerBox: 4 } }],
      }).success,
    ).toBe(false);
    expect(
      receiptSchema.safeParse({ ...base, lines: [{ ...line, blistersPerBox: 4 }] }).success,
    ).toBe(false);
  });
});
