import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  saleSchema,
  paymentSchema,
  settlementBasisForLines,
  paymentSettlementBasis,
  quotedVesToUsd,
  paymentMethodOptions,
  paymentMethodLabel,
} from '../../packages/domain/src/commerce';

const sale = () => ({
  clientId: randomUUID(),
  condition: 'credit' as 'cash' | 'credit',
  soldAt: '2026-11-05T14:00:00Z',
  dueDate: null as string | null,
  reminderDate: null as string | null,
  lines: [
    {
      configurationId: randomUUID(),
      presentation: 'box',
      quantity: 2,
      priceBasis: 'usd_cash_promo',
      agreedUnitUsd: '40',
    },
  ],
});

describe('precio pactado y moneda de cobro independientes de contado/crédito', () => {
  it('deriva la base del precio pactado y rechaza mezclar acuerdos en una venta', () => {
    const input = sale();
    expect(settlementBasisForLines([{ priceBasis: 'usd_cash_promo' }])).toBe('divisa');
    expect(settlementBasisForLines([{ priceBasis: 'ves_regular' }])).toBe('bcv');
    for (const condition of ['cash', 'credit']) {
      expect(saleSchema.safeParse({ ...input, condition, initialPayment: payment() }).success).toBe(
        true,
      );
      expect(
        saleSchema.safeParse({
          ...input,
          condition,
          lines: [...input.lines, { ...input.lines[0]!, priceBasis: 'ves_regular' }],
        }).success,
      ).toBe(false);
    }
  });

  it('separa acuerdos para VES; USD/USDT 1:1 admite reparto y conserva BCV histórico', () => {
    expect(paymentSettlementBasis(['bcv', 'legacy_bcv'])).toBe('bcv');
    expect(paymentSettlementBasis(['divisa', 'divisa'])).toBe('divisa');
    expect(() => paymentSettlementBasis(['divisa', 'bcv'])).toThrow(/por separado/);
    expect(() => paymentSettlementBasis(['divisa', 'bcv'], 'USD')).not.toThrow();
    expect(() => paymentSettlementBasis(['divisa', 'bcv'], 'USDT')).not.toThrow();
  });

  it('métodos confirmados son compatibles con moneda; otros y tasas del navegador se rechazan', () => {
    const base = {
      ...payment(),
      clientId: randomUUID(),
      applications: [{ saleId: randomUUID(), amountUsd: '80' }],
    };
    for (const option of paymentMethodOptions) {
      const data = {
        ...base,
        currency: option.currency,
        method: option.id,
        ...(option.currency === 'VES' ? { rateId: randomUUID() } : {}),
      };
      expect(paymentSchema.safeParse(data).success).toBe(true);
      expect(paymentMethodLabel(option.id)).toBe(option.label);
    }
    for (const method of [
      'Transferencia',
      'Pago móvil',
      'Punto de venta',
      'Otro',
      'bolivares',
      'usdt_transfer',
    ])
      expect(paymentSchema.safeParse({ ...base, method }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...base, rateId: randomUUID() }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...base, currency: 'VES', method: 'bolivares' }).success).toBe(
      false,
    );
    expect(
      paymentSchema.safeParse({
        ...base,
        currency: 'VES',
        method: 'bolivares',
        rateId: randomUUID(),
        rate: '1',
      }).success,
    ).toBe(false);
    // Old USD strings remain byte-for-byte inputs; normalization must not alter retry hashes.
    expect(paymentSchema.parse({ ...base, method: 'USD efectivo' }).method).toBe('USD efectivo');
  });

  it('USDT positivo liquida 1:1 y no puede dejar un recordatorio con saldo cero', () => {
    const full = { ...payment(), currency: 'USDT', method: 'usdt_transfer' };
    expect(saleSchema.safeParse({ ...sale(), initialPayment: full }).success).toBe(true);
    expect(
      saleSchema.safeParse({ ...sale(), initialPayment: full, reminderDate: '2026-11-20' }).success,
    ).toBe(false);
    expect(
      saleSchema.safeParse({ ...sale(), initialPayment: { ...full, amount: '0' } }).success,
    ).toBe(false);
  });

  it('conversión decimal exige fuente correspondiente y vigencia exacta, sin revalorar la deuda', () => {
    const at = new Date('2026-11-05T14:00:00Z');
    const quote = {
      rate: '60',
      source: 'BINANCE_P2P_BUY' as const,
      verifiedAt: new Date('2026-11-05T13:59:00Z'),
      validFrom: new Date('2026-11-05T13:59:00Z'),
      validUntil: new Date('2026-11-05T14:01:00Z'),
    };
    expect(quotedVesToUsd('1000', quote, 'divisa', at)).toBe('16.67');
    expect(() => quotedVesToUsd('1000', quote, 'bcv', at)).toThrow();
    expect(() => quotedVesToUsd('1000', quote, 'divisa', quote.validUntil)).toThrow();
    expect(() =>
      quotedVesToUsd(
        '1000',
        { ...quote, verifiedAt: new Date('2026-11-05T14:00:01Z') },
        'divisa',
        at,
      ),
    ).toThrow();
    expect(quotedVesToUsd('1000', { ...quote, source: 'BCV' }, 'bcv', at)).toBe('16.67');
  });
});
const payment = (amount = '80') => ({
  currency: 'USD',
  amount,
  method: 'Efectivo USD',
  receivedAt: '2026-11-05T14:00:00Z',
});

describe('hotfix UX v3: fechas únicamente para crédito pendiente', () => {
  it.each(['dueDate', 'reminderDate'] as const)(
    'rechaza %s inyectada en contado aunque el cobro cubra el total',
    (field) => {
      expect(
        saleSchema.safeParse({
          ...sale(),
          condition: 'cash',
          initialPayment: payment(),
          [field]: '2026-11-20',
        }).success,
      ).toBe(false);
    },
  );

  it.each(['dueDate', 'reminderDate'] as const)(
    'rechaza %s en crédito pagado completamente en USD',
    (field) => {
      expect(
        saleSchema.safeParse({
          ...sale(),
          initialPayment: payment(),
          [field]: '2026-11-20',
        }).success,
      ).toBe(false);
    },
  );

  it('un total cero tampoco habilita fechas de cobranza', () => {
    const input = sale();
    input.lines[0]!.agreedUnitUsd = '0';
    expect(saleSchema.safeParse({ ...input, reminderDate: '2026-11-20' }).success).toBe(false);
  });

  it('crédito sin abono conserva fecha pactada y recordatorio independientes', () => {
    const parsed = saleSchema.parse({
      ...sale(),
      dueDate: '2026-11-20',
      reminderDate: '2026-11-12',
    });
    expect(parsed.initialPayment).toBeUndefined();
    expect(parsed.dueDate).toBe('2026-11-20');
    expect(parsed.reminderDate).toBe('2026-11-12');
  });

  it('el crédito parcial mantiene sus fechas y el pago total es válido sin ellas', () => {
    expect(
      saleSchema.safeParse({
        ...sale(),
        initialPayment: payment('30'),
        dueDate: '2026-11-20',
        reminderDate: '2026-11-12',
      }).success,
    ).toBe(true);
    expect(saleSchema.safeParse({ ...sale(), initialPayment: payment() }).success).toBe(true);
  });

  it('la liquidación se compara con la suma de renglones redondeados, no con float', () => {
    const input = sale();
    input.lines = [
      { ...input.lines[0]!, quantity: 1, agreedUnitUsd: '0.005' },
      { ...input.lines[0]!, quantity: 1, agreedUnitUsd: '0.005' },
    ];
    expect(
      saleSchema.safeParse({
        ...input,
        initialPayment: payment('0.02'),
        reminderDate: '2026-11-20',
      }).success,
    ).toBe(false);
    expect(
      saleSchema.safeParse({
        ...input,
        initialPayment: payment('0.01'),
        reminderDate: '2026-11-20',
      }).success,
    ).toBe(true);
  });
});
