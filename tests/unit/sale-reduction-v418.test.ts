import { describe, it, expect } from 'vitest';
import { planSaleReduction } from '../../packages/domain/src/sale-reduction';
describe('quitar mercancía del pedido sin inventar el destino del dinero', () => {
  const lines = [
    { id: 'apples', quantity: 2, agreedUnitUsd: '40', totalUsd: '80.00' },
    { id: 'cherries', quantity: 1, agreedUnitUsd: '30', totalUsd: '30.00' },
  ];
  it('venta pagada: identifica la diferencia de las cerezas', () => {
    expect(planSaleReduction(lines, [{ lineId: 'cherries', quantity: 1 }], '110')).toMatchObject({
      totalUsd: '80.00',
      reductionUsd: '30.00',
      excessPaidUsd: '30.00',
      balanceUsd: '0.00',
      removesWholeSale: false,
    });
  });
  it('abono parcial: reduce deuda y separa únicamente el exceso real', () => {
    expect(planSaleReduction(lines, [{ lineId: 'cherries', quantity: 1 }], '50')).toMatchObject({
      totalUsd: '80.00',
      excessPaidUsd: '0.00',
      balanceUsd: '30.00',
    });
    expect(planSaleReduction(lines, [{ lineId: 'cherries', quantity: 1 }], '90')).toMatchObject({
      excessPaidUsd: '10.00',
      balanceUsd: '0.00',
    });
  });
  it('devoluciones sucesivas conservan el céntimo del redondeo original', () => {
    const first = planSaleReduction(
      [{ id: 'x', quantity: 3, agreedUnitUsd: '0.3333', totalUsd: '1.00' }],
      [{ lineId: 'x', quantity: 1 }],
      '0',
    );
    expect(first).toMatchObject({ reductionUsd: '0.33', totalUsd: '0.67' });
    expect(
      planSaleReduction(
        [{ id: 'x', quantity: 2, agreedUnitUsd: '0.3333', totalUsd: first.totalUsd }],
        [{ lineId: 'x', quantity: 1 }],
        '0',
      ),
    ).toMatchObject({ reductionUsd: '0.34', totalUsd: '0.33' });
  });
  it('reconoce la anulación completa y conserva cada presentación', () => {
    expect(
      planSaleReduction(
        [{ id: 'half', quantity: 2, agreedUnitUsd: '20', totalUsd: '40' }],
        [{ lineId: 'half', quantity: 1 }],
        '40',
      ).changes,
    ).toMatchObject([{ quantity: 1, remainingQuantity: 1 }]);
    expect(
      planSaleReduction(
        lines,
        [
          { lineId: 'apples', quantity: 2 },
          { lineId: 'cherries', quantity: 1 },
        ],
        '110',
      ),
    ).toMatchObject({ totalUsd: '0.00', excessPaidUsd: '110.00', removesWholeSale: true });
  });
  it('rechaza cantidades inexistentes, repetidas y totales incoherentes', () => {
    for (const selected of [
      [{ lineId: 'other', quantity: 1 }],
      [{ lineId: 'apples', quantity: 3 }],
      [{ lineId: 'apples', quantity: 0 }],
      [{ lineId: 'apples', quantity: 0.5 }],
      [
        { lineId: 'cherries', quantity: 1 },
        { lineId: 'cherries', quantity: 1 },
      ],
    ])
      expect(() => planSaleReduction(lines, selected, '0')).toThrow();
    expect(() =>
      planSaleReduction(
        [{ ...lines[0], totalUsd: '99' }],
        [{ lineId: 'apples', quantity: 1 }],
        '0',
      ),
    ).toThrow();
  });
});
