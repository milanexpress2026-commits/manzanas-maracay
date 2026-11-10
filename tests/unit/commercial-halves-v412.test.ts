import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  planPhysicalSale,
  previewPhysicalSale,
  type SalePlannerStock,
} from '../../packages/domain/src/sale-planner';
import { summarizeContainers } from '../../packages/domain/src/inventory';
import { countSellablePresentation } from '../../packages/domain/src/sale-availability';
import type { Presentation } from '../../packages/domain/src/commerce';
const time = '2026-11-10T10:00:00Z';
function fixture(blisters: number, boxes = 1, cost: string | null = null): SalePlannerStock {
  const id = randomUUID(),
    variantId = randomUUID(),
    warehouseId = randomUUID();
  return {
    requireConfirmedLots: true,
    rules: [
      {
        id: randomUUID(),
        variantId,
        commercialUnitLabel: null,
        confirmed: true,
        allowedPresentations: ['box', 'half_box', 'blister'],
      },
    ],
    lots: [
      {
        id,
        variantId,
        commercialUnitLabel: null,
        confirmed: true,
        receivedAt: '2026-11-09T10:00:00Z',
        createdAt: time,
        fifoOrder: 0,
        packingModel: 'blister',
        halfPreparation: 'counted',
        allowedPresentations: ['box', 'half_box', 'blister'],
        blistersPerBox: blisters,
        containers: Array.from({ length: boxes }, () => ({
          id: randomUUID(),
          lotId: id,
          warehouseId,
          parentId: null,
          kind: 'box',
          state: 'sealed',
          unit: 'sealed_box',
          quantity: 1,
          countedPieces: null,
          version: 1,
          costUsd: cost,
        })),
      },
    ],
  };
}
function input(s: SalePlannerStock, presentation: Presentation, quantity = 1) {
  return {
    soldAt: time,
    lines: [{ lineKey: randomUUID(), configurationId: s.rules[0]!.id, presentation, quantity }],
  };
}
function execute(s: SalePlannerStock, p: Presentation, q = 1) {
  const result = planPhysicalSale(input(s, p, q), s, { newContainerId: randomUUID });
  expect(result.valid).toBe(true);
  for (const lot of s.lots)
    lot.containers = [...(result.states.get(lot.id)?.values() ?? lot.containers)];
  return result;
}
describe('media caja comercial automática V4.12', () => {
  for (const b of [4, 5]) {
    it(`${b} blíster: vende dos medias consecutivas, sin conteo ni preparación y sin duplicar existencias`, () => {
      const s = fixture(b, 1, '25.0000');
      expect(previewPhysicalSale(input(s, 'half_box'), s, time).lines[0]?.maxQuantity).toBe(2);
      const first = execute(s, 'half_box');
      expect(first.allocations[0]?.costUsd).toBe('12.5000');
      expect(summarizeContainers(s.lots[0]!.containers, b).equivalentBoxes).toBe(0.5);
      expect(countSellablePresentation(s.lots, 'half_box', true).availableQuantity).toBe(1);
      expect(execute(s, 'half_box').allocations[0]?.costUsd).toBe('12.5000');
      expect(summarizeContainers(s.lots[0]!.containers, b).equivalentBoxes).toBe(0);
      expect(planPhysicalSale(input(s, 'half_box'), s).valid).toBe(false);
    });
    it(`${b} blíster: combina presentaciones en ambos órdenes sin sobreventa`, () => {
      for (let boxes = 0; boxes <= 1; boxes++)
        for (let halves = 0; halves <= 3; halves++)
          for (let blisters = 0; blisters <= b + 1; blisters++) {
            const s = fixture(b),
              lines = [
                ...input(s, 'box', boxes).lines,
                ...input(s, 'half_box', halves).lines,
                ...input(s, 'blister', blisters).lines,
              ].filter((l) => l.quantity > 0);
            if (!lines.length) continue;
            const expected = boxes + halves / 2 + blisters / b <= 1;
            for (const ordered of [lines, [...lines].reverse()]) {
              const plan = planPhysicalSale({ soldAt: time, lines: ordered }, s);
              expect(plan.valid, JSON.stringify({ b, boxes, halves, blisters })).toBe(expected);
              if (plan.valid)
                expect(
                  summarizeContainers(
                    [...plan.states.values()][0] ? [...[...plan.states.values()][0]!.values()] : [],
                    b,
                  ).equivalentBoxes,
                ).toBeCloseTo(1 - boxes - halves / 2 - blisters / b, 10);
            }
          }
    });
  }
  it('cinco blíster: tras media y dos blíster conserva medio blíster y aprovecha otra caja del mismo lote', () => {
    const s = fixture(5, 2, '20.0000');
    execute(s, 'half_box');
    execute(s, 'blister', 2);
    expect(summarizeContainers(s.lots[0]!.containers, 5).equivalentBoxes).toBeCloseTo(1.1);
    expect(countSellablePresentation(s.lots, 'blister', true).availableQuantity).toBe(5);
    execute(s, 'half_box', 2);
    expect(summarizeContainers(s.lots[0]!.containers, 5).equivalentBoxes).toBeCloseTo(0.1);
    expect(planPhysicalSale(input(s, 'blister'), s).valid).toBe(false);
  });
  it('reproduce Roja 113: 33 cajas ofrecen 66 medias sin reservar mercancía', () => {
    const s = fixture(5, 33),
      before = structuredClone(s);
    expect(previewPhysicalSale(input(s, 'half_box'), s, time).lines[0]?.maxQuantity).toBe(66);
    expect(s).toEqual(before);
    expect(planPhysicalSale(input(s, 'half_box', 67), s).valid).toBe(false);
    execute(s, 'half_box', 66);
    expect(summarizeContainers(s.lots[0]!.containers, 5).equivalentBoxes).toBe(0);
  });
});
