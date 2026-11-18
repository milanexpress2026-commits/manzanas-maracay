import { describe, it, expect } from 'vitest';
import {
  correctedPaymentAmount,
  refundAmounts,
  paymentCorrectionSchema,
} from '../../packages/domain/src/commerce-corrections';
describe('correcciones monetarias históricas', () => {
  it('devuelve el remanente exacto en la moneda original sin aplicar una tasa nueva', () => {
    expect(correctedPaymentAmount('20.00', '239.12345678')).toBe('4782.47');
    expect(
      refundAmounts(
        [
          {
            reversed: false,
            appliedUsd: '40.00',
            amountUsd: '40.00',
            amount: '9564.94',
            currency: 'VES',
            conversionRate: '239.12345678',
          },
        ],
        '20.00',
      ),
    ).toEqual([{ currency: 'VES', amount: '4782.47' }]);
  });
  it('solo usa la parte de la venta y omite abonos revertidos', () => {
    const payments = [
      {
        reversed: false,
        appliedUsd: '10.00',
        amountUsd: '30.00',
        amount: '30.00',
        currency: 'USD',
      },
      { reversed: false, appliedUsd: '5.00', amountUsd: '5.00', amount: '5.00', currency: 'USDT' },
      { reversed: true, appliedUsd: '80.00', amountUsd: '80.00', amount: '80.00', currency: 'USD' },
    ];
    expect(refundAmounts(payments, '12.00')).toEqual([
      { currency: 'USDT', amount: '5.00' },
      { currency: 'USD', amount: '7.00' },
    ]);
  });
  it('admite corregir a cero y rechaza negativos o precisión monetaria sobrante', () => {
    const body = {
      expectedVersion: 0,
      amount: '0',
      applications: [{ saleId: 'de3fbf45-e66a-4dc4-ae67-590a941ace74', amountUsd: '0' }],
      reason: 'Importe anotado por error',
    };
    expect(paymentCorrectionSchema.parse(body).amount).toBe('0.00');
    expect(paymentCorrectionSchema.safeParse({ ...body, amount: '-1' }).success).toBe(false);
    expect(paymentCorrectionSchema.safeParse({ ...body, amount: '0.001' }).success).toBe(false);
  });
});
