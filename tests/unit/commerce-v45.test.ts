import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  legacySaleSchema,
  manualSaleSchema,
  saleSchema,
  initialPaymentSchema,
  settleQuotedVes,
  quotedVesToUsd,
  totalSaleLines,
} from '../../packages/domain/src/commerce';

const instant = new Date('2026-11-06T12:05:00Z');
const quote = {
  rate: '0.6',
  source: 'BINANCE_P2P_BUY' as const,
  verifiedAt: new Date('2026-11-06T12:00:00Z'),
  validFrom: new Date('2026-11-06T12:00:00Z'),
  validUntil: new Date('2026-11-06T12:10:00Z'),
};
const manual = () => ({
  schemaVersion: 2,
  clientId: randomUUID(),
  condition: 'credit',
  settlementBasis: 'divisa',
  soldAt: instant.toISOString(),
  lines: [{ configurationId: randomUUID(), presentation: 'box', quantity: 2, agreedUnitUsd: '40' }],
});

describe('V4.5 precio escrito por operación', () => {
  it('no requiere lista o referencia y conserva precios de operaciones distintas', () => {
    const first = manualSaleSchema.parse(manual());
    const second = manualSaleSchema.parse({
      ...first,
      lines: [{ ...first.lines[0], agreedUnitUsd: '43' }],
    });
    expect(first.lines[0].agreedUnitUsd).toBe('40.0000');
    expect(second.lines[0].agreedUnitUsd).toBe('43.0000');
    expect(
      totalSaleLines(first.lines.map((line) => ({ ...line, referenceUnitUsd: null }))),
    ).toEqual({ totalUsd: '80.00', discountUsd: null });
    expect('priceBasis' in first.lines[0]).toBe(false);
  });
  it('exige precio positivo, cantidades enteras y acuerdo independiente', () => {
    const base = manual();
    for (const price of ['0', '-1', 'NaN', 'Infinity', '1.00001'])
      expect(
        saleSchema.safeParse({ ...base, lines: [{ ...base.lines[0], agreedUnitUsd: price }] })
          .success,
      ).toBe(false);
    for (const quantity of [0, -1, 1.5, 1001])
      expect(
        saleSchema.safeParse({ ...base, lines: [{ ...base.lines[0], quantity }] }).success,
      ).toBe(false);
    expect(saleSchema.safeParse({ ...base, settlementBasis: undefined }).success).toBe(false);
    expect(saleSchema.safeParse({ ...base, settlementBasis: 'legacy_bcv' }).success).toBe(false);
    expect(saleSchema.safeParse({ ...base, settlementBasis: 'bcv' }).success).toBe(true);
    for (const injected of [
      { priceBasis: 'usd_cash_promo' },
      { referenceUnitUsd: '50' },
      { costUsd: '0' },
    ])
      expect(
        saleSchema.safeParse({ ...base, lines: [{ ...base.lines[0], ...injected }] }).success,
      ).toBe(false);
  });
  it('conserva forma parseada histórica sin schemaVersion ni nuevos valores predeterminados', () => {
    const base = manual();
    const old = {
      clientId: base.clientId,
      condition: base.condition,
      soldAt: base.soldAt,
      lines: [{ ...base.lines[0], priceBasis: 'usd_cash_promo' }],
    };
    expect(saleSchema.parse(old)).toEqual(legacySaleSchema.parse(old));
    expect(Object.keys(saleSchema.parse(old)).sort()).toEqual([
      'clientId',
      'condition',
      'dueDate',
      'lines',
      'notes',
      'reminderDate',
      'soldAt',
    ]);
  });
  it('contado no admite fechas de cobranza y crédito puede no tener pago', () => {
    expect(saleSchema.safeParse(manual()).success).toBe(true);
    expect(
      saleSchema.safeParse({ ...manual(), condition: 'cash', dueDate: '2026-11-13' }).success,
    ).toBe(false);
    expect(
      saleSchema.safeParse({ ...manual(), condition: 'cash', reminderDate: '2026-11-13' }).success,
    ).toBe(false);
  });
  it('no descuenta mercancía por un total manual que se redondea a cero', () => {
    const input = manual();
    expect(
      saleSchema.safeParse({
        ...input,
        condition: 'cash',
        lines: [{ ...input.lines[0], quantity: 1, agreedUnitUsd: '0.0001' }],
      }).success,
    ).toBe(false);
    // Four-decimal unit prices remain meaningful when quantity reaches cents.
    expect(
      saleSchema.safeParse({
        ...input,
        lines: [{ ...input.lines[0], quantity: 100, agreedUnitUsd: '0.0001' }],
      }).success,
    ).toBe(true);
  });
});

describe('V4.5 referencia informativa USDT y liquidación decimal VES', () => {
  it('USDT sigue 1:1 con referencia opcional y no admite tasa de conversión VES', () => {
    const input = {
      currency: 'USDT',
      amount: '40',
      method: 'usdt_transfer',
      receivedAt: instant.toISOString(),
    };
    expect(initialPaymentSchema.parse(input).amount).toBe('40.00');
    expect(
      initialPaymentSchema.parse({ ...input, informationalUsdtRateId: randomUUID() }).currency,
    ).toBe('USDT');
    expect(initialPaymentSchema.safeParse({ ...input, rateId: randomUUID() }).success).toBe(false);
    expect(
      initialPaymentSchema.safeParse({
        ...input,
        currency: 'USD',
        method: 'usd_cash',
        informationalUsdtRateId: randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      initialPaymentSchema.safeParse({ ...input, currency: 'VES', method: 'bolivares' }).success,
    ).toBe(false);
  });
  it('liquida exactamente Bs mostrados sin fabricar un centavo residual', () => {
    // Synthetic low quote exercises the rounding boundary; never a live quote.
    expect(quotedVesToUsd('24.01', quote, 'divisa', instant)).toBe('40.02');
    expect(settleQuotedVes('24.01', quote, 'divisa', instant, '40.01')).toEqual({
      amountUsd: '40.01',
      roundingUsd: '-0.01',
    });
    expect(settleQuotedVes('24.02', quote, 'divisa', instant, '40.04')).toEqual({
      amountUsd: '40.04',
      roundingUsd: '0.01',
    });
  });
  it('no perdona deuda o exceso fuera de la igualdad de redondeo VES', () => {
    expect(settleQuotedVes('24.00', quote, 'divisa', instant, '40.02')).toEqual({
      amountUsd: '40.00',
      roundingUsd: '0.00',
    });
    expect(settleQuotedVes('25.00', quote, 'divisa', instant, '40.00')).toEqual({
      amountUsd: '41.67',
      roundingUsd: '0.00',
    });
    for (const target of ['0', '-1', '40.001', 'NaN'])
      expect(() => settleQuotedVes('24.00', quote, 'divisa', instant, target)).toThrow();
  });
  it('fuente incorrecta, tasa caducada, futura o no positiva no habilitan ajuste', () => {
    expect(() => settleQuotedVes('24', quote, 'bcv', instant, '40')).toThrow();
    expect(() => settleQuotedVes('24', quote, 'divisa', quote.validUntil, '40')).toThrow();
    expect(() =>
      settleQuotedVes(
        '24',
        { ...quote, verifiedAt: new Date('2026-11-06T12:06:00Z') },
        'divisa',
        instant,
        '40',
      ),
    ).toThrow();
    for (const rate of ['0', '-1', 'NaN', 'Infinity'])
      expect(() => settleQuotedVes('24', { ...quote, rate }, 'divisa', instant, '40')).toThrow();
  });
});
