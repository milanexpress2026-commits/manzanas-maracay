import { describe, expect, it } from 'vitest';
import {
  buildHabitualCatalogOptions,
  getHabitualTemplate,
  habitualPacking,
  type Catalog,
} from '../../packages/domain/src/index';

const empty: Catalog = { fruits: [], varieties: [], calibers: [], configurations: [] };
describe('catálogo habitual V4.5 sin materializar productos', () => {
  it('separa las tres variedades a granel con todos sus calibres, incluidos 235 y PC', () => {
    const catalog = structuredClone(empty);
    const result = buildHabitualCatalogOptions(catalog);
    expect(result.templateVersion).toBe('v4.5');
    const bulk = result.options.filter((option) => option.templateId === 'apple_bulk');
    expect(bulk).toHaveLength(24);
    expect(new Set(bulk.map((option) => option.optionKey)).size).toBe(24);
    for (const variety of ['Roja normal', 'Gala', 'Verde']) {
      const rows = bulk.filter((option) => option.varietyName === variety);
      expect(rows.map((option) => option.caliberLabel)).toEqual([
        '150',
        '163',
        '175',
        '198',
        '216',
        '232',
        '235',
        'PC',
      ]);
      expect(
        rows.every(
          (option) =>
            option.commercialLine === 'A granel' &&
            option.suggestedPacking?.blistersPerBox === null &&
            option.suggestedPacking.boxWeightKg === null,
        ),
      ).toBe(true);
    }
    expect(catalog).toEqual(empty);
  });
  it('aplica exactamente la regla de peras y no adivina el calibre intermedio 130', () => {
    const pear = getHabitualTemplate('pear', 'v4.5')!;
    expect(pear.varieties).toEqual(['Forelle', 'Packham']);
    for (const variety of pear.varieties) {
      for (const caliber of ['70', '80', '90', '100', '110', '120', '125'])
        expect(habitualPacking(pear, variety, caliber)?.blistersPerBox).toBe(4);
      for (const caliber of ['135', '150', '165'])
        expect(habitualPacking(pear, variety, caliber)?.blistersPerBox).toBe(5);
      expect(habitualPacking(pear, variety, '130')?.blistersPerBox).toBeNull();
    }
    expect(getHabitualTemplate('pear', 'v4.2')?.varieties).toContain('Packcam');
    expect(
      habitualPacking(getHabitualTemplate('pear', 'v4.2')!, 'Packcam', '100')?.blistersPerBox,
    ).toBeNull();
  });
  it('ofrece los cuatro alimentos sin inventar unidad, peso o blíster', () => {
    const foods = buildHabitualCatalogOptions(empty).options.filter(
      (option) => option.requiresCommercialUnit,
    );
    expect(foods.map((option) => option.fruitName)).toEqual([
      'Pasas',
      'Alcaparras',
      'Aceituna rellena',
      'Aceituna con hueso',
    ]);
    expect(
      foods.every(
        (option) =>
          option.needsPresentation &&
          option.suggestedPacking === null &&
          option.configurationId === null,
      ),
    ).toBe(true);
    expect(getHabitualTemplate('raisins', 'v4.2')).toBeUndefined();
  });
  it('conserva una configuración histórica Packcam separada de Packham, sin renombrarla', () => {
    const catalog: Catalog = {
      ...structuredClone(empty),
      fruits: [{ id: 'fruit', name: 'Pera' }],
      varieties: [{ id: 'variety', fruitId: 'fruit', name: 'Packcam' }],
      calibers: [{ id: 'caliber', fruitId: 'fruit', label: '100' }],
      configurations: [
        {
          id: 'config',
          variantId: 'variant',
          fruitId: 'fruit',
          varietyId: 'variety',
          caliberId: 'caliber',
          fruit: 'Pera',
          variety: 'Packcam',
          caliber: '100',
          commercialLine: 'Estándar',
          packingModel: 'blister',
          blistersPerBox: 5,
          halfPreparation: 'counted',
          allowedPresentations: ['box', 'blister', 'half_box'],
          boxWeightKg: null,
          confirmationStatus: 'confirmed',
          version: 9,
          notes: '',
          prices: [],
        },
      ],
    };
    const result = buildHabitualCatalogOptions(catalog);
    const historic = result.options.find((option) => option.configurationId === 'config')!;
    expect(historic).toMatchObject({
      varietyName: 'Packcam',
      packingVersion: 9,
      currentPacking: { blistersPerBox: 5 },
    });
    const current = result.options.find(
      (option) => option.varietyName === 'Packham' && option.caliberLabel === '100',
    )!;
    expect(current.configurationId).toBeNull();
    expect(current.suggestedPacking?.blistersPerBox).toBe(4);
    expect(catalog.configurations[0].variety).toBe('Packcam');
  });
  it('permite completar la unidad de un alimento histórico sin fusionar su línea con la habitual', () => {
    const configuration: Catalog['configurations'][number] = {
      id: 'food',
      variantId: 'old-variant',
      fruitId: 'raisins',
      varietyId: null,
      caliberId: null,
      fruit: 'Pasas',
      variety: null,
      caliber: null,
      commercialLine: 'Estándar',
      packingModel: 'whole',
      blistersPerBox: null,
      halfPreparation: 'none',
      allowedPresentations: ['box'],
      boxWeightKg: null,
      commercialUnitLabel: null,
      confirmationStatus: 'confirmed',
      version: 7,
      notes: '',
      prices: [],
    };
    const catalog: Catalog = {
      ...structuredClone(empty),
      fruits: [{ id: 'raisins', name: 'Pasas' }],
      configurations: [configuration],
    };
    const result = buildHabitualCatalogOptions(catalog);
    const old = result.options.find((option) => option.configurationId === 'food')!;
    expect(old).toMatchObject({
      optionKey: 'configuration/food',
      commercialLine: 'Estándar',
      requiresCommercialUnit: true,
      needsPresentation: true,
      product: { configurationId: 'food', expectedPackingVersion: 7 },
      currentPacking: { packingModel: 'whole', commercialUnitLabel: null },
    });
    expect(
      result.options.find((option) => option.templateId === 'raisins')?.configurationId,
    ).toBeNull();
    expect(configuration.commercialUnitLabel).toBeNull();
    const named = buildHabitualCatalogOptions({
      ...catalog,
      configurations: [{ ...configuration, commercialUnitLabel: 'Unidad sellada' }],
    });
    expect(
      named.options.find((option) => option.configurationId === 'food')?.needsPresentation,
    ).toBe(false);
  });
});
