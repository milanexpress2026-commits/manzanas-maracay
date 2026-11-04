import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  configurationSchema,
  presentationSchema,
  summarizeContainers,
  type ContainerStock,
} from '../../packages/domain/src/index';
import { allocateCost } from '../../packages/domain/src/costing';
const fruitId = '57551505-1210-462a-907d-1e441962fada';
describe('presentaciones comerciales configurables y costo conservativo', () => {
  it('kiwi/granel admiten variedad y calibre ausentes, sin blíster ni piezas inventadas', () => {
    const kiwi = configurationSchema.parse({
      fruitId,
      packingModel: 'halves',
      halfPreparation: 'commercial',
      allowedPresentations: ['box', 'half_box'],
      boxWeightKg: '10',
    });
    expect(kiwi.varietyId).toBeNull();
    expect(kiwi.caliberId).toBeNull();
    expect(kiwi.blistersPerBox).toBeNull();
    expect(() => configurationSchema.parse({ ...kiwi, blistersPerBox: 5 })).toThrow();
  });
  it('solo cajas rechaza medias y blíster; ninguna modalidad ofrece piezas como venta', () => {
    const grape = {
      fruitId,
      packingModel: 'whole',
      halfPreparation: 'none',
      allowedPresentations: ['box'],
    };
    expect(configurationSchema.parse(grape).allowedPresentations).toEqual(['box']);
    expect(() =>
      configurationSchema.parse({ ...grape, allowedPresentations: ['box', 'half_box'] }),
    ).toThrow();
    expect(() => presentationSchema.parse('piece')).toThrow();
  });
  it('pera conserva empaque y mitad pendientes sin convertir calibre en conteo', () => {
    const pear = configurationSchema.parse({
      fruitId,
      halfPreparation: 'pending',
      blistersPerBox: null,
    });
    expect(pear.blistersPerBox).toBeNull();
    expect(pear.confirmationStatus).toBe('pending');
  });
  it('25 dividido entre tres conserva 8.3333 + 8.3333 + 8.3334, y el conteo 18/19 no crea costo', () => {
    expect(allocateCost('25.0000', [1, 1, 1])).toEqual(['8.3333', '8.3333', '8.3334']);
    const parts = allocateCost('25.0000', [18, 19]);
    expect(parts.reduce((sum, n) => sum.plus(n!), new Decimal(0)).toFixed(4)).toBe('25.0000');
    expect(allocateCost(null, [18, 19])).toEqual([null, null]);
    expect(allocateCost('10', [37, 0])).toEqual(['10.0000', '0.0000']);
  });
  it('ocho cajas cerradas y media comercial se muestran como 8.5 equivalentes, piezas desconocidas', () => {
    const box: ContainerStock = {
      id: fruitId,
      lotId: fruitId,
      warehouseId: fruitId,
      parentId: null,
      kind: 'box',
      state: 'sealed',
      unit: 'sealed_box',
      quantity: 1,
      countedPieces: null,
      version: 1,
    };
    const stock = [
      ...Array.from({ length: 8 }, (_, n) => ({ ...box, id: String(n) })),
      { ...box, id: 'half', kind: 'half_box' as const, unit: 'prepared_half_box' as const },
    ];
    const summary = summarizeContainers(stock, null, 'halves');
    expect(summary.closedBoxes).toBe(8);
    expect(summary.preparedHalfBoxes).toBe(1);
    expect(summary.equivalentBoxes).toBe(8.5);
    expect(summary.intactBlisters).toBe(0);
    expect(stock.every((c) => c.countedPieces === null)).toBe(true);
  });
});
