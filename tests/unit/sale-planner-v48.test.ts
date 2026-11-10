import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  planPhysicalSale,
  previewPhysicalSale,
  salePreviewSchema,
  type SalePlannerStock,
  type SalePlannerLot,
  type SalePreviewInput,
} from '../../packages/domain/src/sale-planner';
import type { ContainerStock } from '../../packages/domain/src/inventory';
import type { Presentation } from '../../packages/domain/src/commerce';

const now = '2026-11-07T12:00:00.000Z';
function fixture(
  boxes: number[],
  model: 'blister' | 'halves' | 'whole' = 'blister',
  blisterCounts = boxes.map(() => 5),
): SalePlannerStock {
  const rule = {
    id: randomUUID(),
    variantId: randomUUID(),
    commercialUnitLabel: null,
    confirmed: true,
    allowedPresentations: (model === 'blister'
      ? ['box', 'blister', 'half_box']
      : model === 'halves'
        ? ['box', 'half_box']
        : ['box']) as Presentation[],
  };
  const lots: SalePlannerLot[] = boxes.map((count, index) => {
    const id = randomUUID();
    return {
      id,
      variantId: rule.variantId,
      commercialUnitLabel: null,
      confirmed: true,
      receivedAt: new Date(Date.parse(now) - (boxes.length - index) * 60000).toISOString(),
      createdAt: now,
      fifoOrder: index,
      packingModel: model,
      halfPreparation: model === 'halves' ? 'commercial' : model === 'blister' ? 'counted' : 'none',
      allowedPresentations: rule.allowedPresentations,
      blistersPerBox: model === 'blister' ? blisterCounts[index] : null,
      containers: Array.from(
        { length: count },
        () =>
          ({
            id: randomUUID(),
            lotId: id,
            warehouseId: randomUUID(),
            parentId: null,
            kind: 'box',
            state: 'sealed',
            unit: 'sealed_box',
            quantity: 1,
            countedPieces: null,
            costUsd: null,
            version: 1,
          }) as ContainerStock,
      ),
    };
  });
  return { rules: [rule], lots, requireConfirmedLots: true };
}
const line = (stock: SalePlannerStock, quantity: number, presentation: Presentation = 'box') => ({
  lineKey: randomUUID(),
  configurationId: stock.rules[0]!.id,
  presentation,
  quantity,
});
const input = (...lines: SalePreviewInput['lines']): SalePreviewInput => ({ soldAt: now, lines });

describe('V4.8 planificación física compartida', () => {
  it('T19 conserva el orden SQL submilisegundo y la fecha exacta, sin reordenar por UUID', () => {
    const stock = fixture([1, 1], 'whole');
    stock.lots[0]!.id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    stock.lots[1]!.id = '00000000-0000-4000-8000-000000000001';
    stock.lots[0]!.receivedAt = '2026-11-07T11:59:00.123Z';
    stock.lots[1]!.receivedAt = '2026-11-07T11:59:00.123Z';
    for (const lot of stock.lots) for (const c of lot.containers) c.lotId = lot.id;
    expect(planPhysicalSale(input(line(stock, 1)), stock).allocations[0]!.lotId).toBe(
      stock.lots[0]!.id,
    );
    stock.lots[1]!.receivedBeforeSale = false;
    expect(planPhysicalSale(input(line(stock, 2)), stock).issues[0]!.issueCode).toBe(
      'receipt_after_sale',
    );
    expect(previewPhysicalSale(input(line(stock, 2)), stock, now).lines[0]!.maxQuantity).toBe(1);
  });
  it('T01/T02 suma5+4, rechaza10 sin mutar y asigna9 FIFO5+4 con costoNULL', () => {
    const stock = fixture([5, 4]);
    const before = structuredClone(stock);
    const nine = input(line(stock, 9));
    expect(previewPhysicalSale(nine, stock, now)).toMatchObject({
      valid: true,
      reservesStock: false,
      lines: [{ maxQuantity: 9 }],
    });
    const plan = planPhysicalSale(nine, stock);
    expect(plan.allocations.filter((a) => a.lotId === stock.lots[0]!.id)).toHaveLength(5);
    expect(plan.allocations.filter((a) => a.lotId === stock.lots[1]!.id)).toHaveLength(4);
    expect(plan.allocations.every((a) => a.costUsd === null)).toBe(true);
    for (const quantity of [10, 25, 1000])
      expect(previewPhysicalSale(input(line(stock, quantity)), stock, now)).toMatchObject({
        valid: false,
        lines: [{ maxQuantity: 9, issueCode: 'stock_insufficient' }],
      });
    expect(stock).toEqual(before);
  });
  it('T04 compartecuota6+4/6+3, reordenar mantiene factibilidad y eliminar libera stock', () => {
    const stock = fixture([5, 4]);
    const a = line(stock, 6),
      b = line(stock, 4);
    expect(previewPhysicalSale(input(a, b), stock, now)).toMatchObject({
      valid: false,
      lines: [{ maxQuantity: 5 }, { maxQuantity: 3 }],
    });
    b.quantity = 3;
    for (const lines of [
      [a, b],
      [b, a],
    ])
      expect(previewPhysicalSale(input(...lines), stock, now).valid).toBe(true);
    expect(previewPhysicalSale(input(b), stock, now).lines[0]!.maxQuantity).toBe(9);
  });
  it('T06 cajas y blíster usan recursoscompartidos enambosórdenes', () => {
    const stock = fixture([3]);
    const box = line(stock, 2),
      blister = line(stock, 6, 'blister');
    for (const lines of [
      [box, blister],
      [blister, box],
    ]) {
      expect(previewPhysicalSale(input(...lines), stock, now).valid).toBe(false);
      expect(planPhysicalSale(input(...lines), stock).allocations).toEqual([]);
    }
    blister.quantity = 5;
    for (const lines of [
      [box, blister],
      [blister, box],
    ]) {
      const plan = planPhysicalSale(input(...lines), stock);
      expect(plan.valid).toBe(true);
      expect(plan.allocations).toHaveLength(7);
      expect(
        [...plan.states.values()]
          .flatMap((state) => [...state.values()])
          .filter((c) => c.quantity > 0),
      ).toHaveLength(0);
    }
  });
  it('T19 reserva cajasantesabrir; lotes4/5/5 admiten2cajas+5blísterindependientedelorden', () => {
    const stock = fixture([1, 1, 1], 'blister', [4, 5, 5]);
    const boxes = line(stock, 2),
      blisters = line(stock, 5, 'blister');
    for (const lines of [
      [blisters, boxes],
      [boxes, blisters],
    ]) {
      const plan = planPhysicalSale(input(...lines), stock);
      expect(plan.valid).toBe(true);
      expect(
        plan.allocations.filter((a) => a.lineKey === boxes.lineKey).map((a) => a.lotId),
      ).toEqual(stock.lots.slice(0, 2).map((l) => l.id));
      expect(
        plan.allocations
          .filter((a) => a.lineKey === blisters.lineKey)
          .every((a) => a.lotId === stock.lots[2]!.id),
      ).toBe(true);
    }
  });
  it('T07 usa4/5históricos, remanentesantesapertura yno cuenta padreabierto', () => {
    const stock = fixture([1, 1], 'blister', [4, 5]);
    const first = planPhysicalSale(input(line(stock, 1, 'blister')), stock);
    stock.lots[0]!.containers = [...first.states.get(stock.lots[0]!.id)!.values()];
    const preview = previewPhysicalSale(
      input(line(stock, 1, 'blister'), line(stock, 1)),
      stock,
      now,
    );
    expect(preview).toMatchObject({ valid: true, lines: [{ maxQuantity: 3 }, { maxQuantity: 1 }] });
    expect(
      planPhysicalSale(input(line(stock, 3, 'blister')), stock).allocations.every(
        (a) => a.lotId === stock.lots[0]!.id,
      ),
    ).toBe(true);
  });
  it('T09 mediascomerciales nocuentan comocajas yno se duplican', () => {
    const stock = fixture([2], 'halves');
    const box = line(stock, 1),
      half = line(stock, 3, 'half_box');
    expect(previewPhysicalSale(input(box, half), stock, now).valid).toBe(false);
    half.quantity = 2;
    for (const lines of [
      [half, box],
      [box, half],
    ])
      expect(planPhysicalSale(input(...lines), stock).valid).toBe(true);
    const oneHalf = planPhysicalSale(input(line(stock, 1, 'half_box')), stock);
    stock.lots[0]!.containers = [...oneHalf.states.get(stock.lots[0]!.id)!.values()];
    expect(previewPhysicalSale(input(line(stock, 1)), stock, now).lines[0]!.maxQuantity).toBe(1);
  });
  it('T05 identidad exactavariante/unidad; lotes ajenos noinflanmax', () => {
    const stock = fixture([2]);
    stock.lots.push({
      ...structuredClone(stock.lots[0]!),
      id: randomUUID(),
      variantId: randomUUID(),
    });
    stock.lots.push({
      ...structuredClone(stock.lots[0]!),
      id: randomUUID(),
      commercialUnitLabel: 'Frasco',
    });
    expect(previewPhysicalSale(input(line(stock, 1)), stock, now).lines[0]!.maxQuantity).toBe(2);
  });
  it('T08/T14 vende media automáticamente y conserva rechazos de empaque/producto desconocido', () => {
    const stock = fixture([1]);
    expect(
      previewPhysicalSale(input(line(stock, 1, 'half_box')), stock, now).lines[0],
    ).toMatchObject({ maxQuantity: 2, issueCode: null });
    stock.rules[0]!.confirmed = false;
    expect(previewPhysicalSale(input(line(stock, 1)), stock, now).lines[0]!.issueCode).toBe(
      'packing_pending',
    );
    stock.rules[0]!.confirmed = true;
    stock.lots[0]!.confirmed = false;
    expect(planPhysicalSale(input(line(stock, 1)), stock).issues[0]!.issueCode).toBe(
      'packing_pending',
    );
    expect(
      previewPhysicalSale(input({ ...line(stock, 1), configurationId: randomUUID() }), stock, now)
        .lines[0]!.issueCode,
    ).toBe('configuration_missing');
  });
  it('T19 salta presentación incompatible, conserva ordenFIFO yrechaza fecha anterior', () => {
    const stock = fixture([1, 1]);
    stock.lots[0]!.allowedPresentations = ['box'];
    const sold = planPhysicalSale(input(line(stock, 5, 'blister')), stock);
    expect(sold.valid).toBe(true);
    expect(sold.allocations.every((a) => a.lotId === stock.lots[1]!.id)).toBe(true);
    expect(
      planPhysicalSale({ ...input(line(stock, 1)), soldAt: '2026-11-01T00:00:00Z' }, stock)
        .issues[0]!.issueCode,
    ).toBe('receipt_after_sale');
  });
  it('T10 conserva residuo25/3 yNULL; simulaciones noalterancostos', () => {
    const stock = fixture([1, 1], 'blister', [3, 3]);
    stock.lots[0]!.containers[0]!.costUsd = '25.0000';
    const plan = planPhysicalSale(input(line(stock, 4, 'blister')), stock);
    expect(plan.allocations.map((a) => a.costUsd)).toEqual(['8.3333', '8.3333', '8.3334', null]);
    expect(stock.lots[0]!.containers[0]!.costUsd).toBe('25.0000');
  });
  it('T15 otroscarritosinviables dan maxnull y total>1000noaprueba', () => {
    const stock = fixture([9]);
    expect(
      previewPhysicalSale(input(line(stock, 1), line(stock, 10)), stock, now).lines[0],
    ).toMatchObject({ maxQuantity: null, issueCode: 'cart_conflict' });
    const large = fixture([1000]);
    expect(
      previewPhysicalSale(input(line(large, 501), line(large, 500)), large, now).issues.some(
        (i) => i.issueCode === 'sale_limit_exceeded',
      ),
    ).toBe(true);
    for (const quantity of [0, -1, 1.5, '1e3', 'NaN', Infinity, NaN, 1001])
      expect(
        salePreviewSchema.safeParse(input({ ...line(stock, 1), quantity: quantity as number }))
          .success,
      ).toBe(false);
    expect(
      salePreviewSchema.safeParse(input(...Array.from({ length: 51 }, () => line(stock, 1))))
        .success,
    ).toBe(false);
    const repeated = line(stock, 1);
    expect(salePreviewSchema.safeParse(input(repeated, repeated)).success).toBe(false);
  });
  it('T20 agrupa50líneas/variasrecepciones y conserva paridad con1000unidades', () => {
    const stock = fixture([400, 300, 300], 'whole');
    const cart = input(...Array.from({ length: 50 }, () => line(stock, 20)));
    const preview = previewPhysicalSale(cart, stock, now);
    expect(preview.valid).toBe(true);
    expect(preview.lines.every((l) => l.maxQuantity === 20)).toBe(true);
    const plan = planPhysicalSale(cart, stock);
    expect(plan.valid).toBe(true);
    expect(plan.allocations).toHaveLength(1000);
    expect(new Set(plan.allocations.map((a) => a.containerId)).size).toBe(1000);
  });
});
