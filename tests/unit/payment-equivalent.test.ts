import { describe, expect, it } from 'vitest';
import { paymentEquivalent } from '../../apps/web/src/lib/payment-equivalent';
const now = new Date('2026-11-06T15:00:00Z');
const quote = {
  rate: '0.700000',
  source: 'BINANCE_P2P_BUY',
  verifiedAt: '2026-11-06T14:50:00Z',
  validFrom: '2026-11-06T14:50:00Z',
  validUntil: '2026-11-06T15:10:00Z',
};
describe('equivalente mostrado y liquidación exacta de bolívares', () => {
  it('liquida exactamente el USD cuyo equivalente de dos decimales recibió, sin residuo de un centavo', () => {
    expect(paymentEquivalent('0.01', quote, 'divisa', '0.02', now)).toBe('0.02');
    expect(paymentEquivalent('0.01', quote, 'divisa', undefined, now)).toBe('0.01');
  });
  it('no perdona importes distintos ni sustituye una fuente o una tasa vencida', () => {
    expect(paymentEquivalent('0.02', quote, 'divisa', '0.02', now)).toBe('0.03');
    expect(() => paymentEquivalent('28.00', quote, 'bcv', '40.00', now)).toThrow();
    expect(() =>
      paymentEquivalent('28.00', quote, 'divisa', '40.00', new Date(quote.validUntil)),
    ).toThrow();
    expect(() =>
      paymentEquivalent('28.00', { ...quote, verifiedAt: undefined }, 'divisa', '40.00', now),
    ).toThrow();
  });
});
