import { describe, expect, it } from 'vitest';
import {
  countSellablePresentation,
  type SaleLotSnapshot,
} from '../../packages/domain/src/sale-availability';
import type { ContainerStock } from '../../packages/domain/src/inventory';

function container(
  unit: ContainerStock['unit'],
  costUsd: string | null = '25.0000',
): ContainerStock {
  return {
    id: 'synthetic',
    lotId: 'lot',
    warehouseId: 'warehouse',
    parentId: null,
    kind: unit === 'sealed_box' ? 'box' : unit === 'intact_blister' ? 'blister' : 'half_box',
    state: 'sealed',
    unit,
    quantity: 1,
    countedPieces: null,
    costUsd,
    version: 1,
  };
}
const blister: SaleLotSnapshot = {
  packingModel: 'blister',
  halfPreparation: 'counted',
  allowedPresentations: ['box', 'half_box', 'blister'],
  blistersPerBox: 5,
};
describe('disponibilidad independiente sin reservar ni duplicar recipientes', () => {
  it('dos cajas cerradas y cuatro blíster permiten dos cajas o catorce blíster', () => {
    const lot = {
      ...blister,
      confirmed: true,
      containers: [
        container('sealed_box'),
        container('sealed_box'),
        ...Array.from({ length: 4 }, () => container('intact_blister', '5.0000')),
        { ...container('sealed_box'), state: 'open' as const, quantity: 0 },
      ],
    };
    expect(countSellablePresentation([lot], 'box', true).availableQuantity).toBe(2);
    expect(countSellablePresentation([lot], 'blister', true).availableQuantity).toBe(14);
    expect(countSellablePresentation([lot], 'half_box', true).availableQuantity).toBe(5);
    expect(lot.containers.filter((c) => c.unit === 'sealed_box' && c.quantity === 1)).toHaveLength(
      2,
    );
  });
  it('medias comerciales aprovechan cajas; las contadas requieren preparación real', () => {
    const containers = [container('sealed_box'), container('prepared_half_box', '12.5000')];
    const commercial = {
      ...blister,
      packingModel: 'halves' as const,
      halfPreparation: 'commercial' as const,
      confirmed: true,
      containers,
    };
    expect(countSellablePresentation([commercial], 'half_box', true).availableQuantity).toBe(3);
    expect(
      countSellablePresentation([{ ...commercial, halfPreparation: 'counted' }], 'half_box', true)
        .availableQuantity,
    ).toBe(3);
  });
  it('no inventa blíster desconocidos ni presentaciones incompatibles con el lote', () => {
    const lot = {
      ...blister,
      blistersPerBox: null,
      confirmed: true,
      containers: [container('sealed_box')],
    };
    expect(countSellablePresentation([lot], 'blister', true).availableQuantity).toBe(0);
    expect(
      countSellablePresentation(
        [{ ...lot, packingModel: 'whole', allowedPresentations: ['box'] }],
        'half_box',
        true,
      ).availableQuantity,
    ).toBe(0);
    expect(
      countSellablePresentation(
        [{ ...lot, halfPreparation: 'pending', containers: [container('prepared_half_box')] }],
        'half_box',
        true,
      ).availableQuantity,
    ).toBe(0);
  });
  it('ofrece el stock físico conocido y desconocido sin saltar ni bloquear FIFO por costo', () => {
    const first = {
      ...blister,
      confirmed: true,
      containers: [container('sealed_box'), container('sealed_box', null)],
    };
    const later = { ...blister, confirmed: true, containers: [container('sealed_box')] };
    expect(countSellablePresentation([first, later], 'box', true)).toEqual({
      availableQuantity: 3,
      blockedReason: null,
    });
  });
  it('prioriza blíster disponibles antes de abrir cajas, incluso con costo desconocido', () => {
    const lot = {
      ...blister,
      confirmed: true,
      containers: [container('sealed_box', null), container('intact_blister', '5.0000')],
    };
    expect(countSellablePresentation([lot], 'blister', true).availableQuantity).toBe(6);
  });
  it('producción no ofrece un lote no confirmado; el historial QA conserva su lectura', () => {
    const lot = { ...blister, confirmed: false, containers: [container('sealed_box')] };
    expect(countSellablePresentation([lot], 'box', true)).toMatchObject({
      availableQuantity: 0,
      blockedReason: expect.any(String),
    });
    expect(countSellablePresentation([lot], 'box', false)).toEqual({
      availableQuantity: 1,
      blockedReason: null,
    });
  });
});
