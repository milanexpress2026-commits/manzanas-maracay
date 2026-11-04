import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  businessDate,
  addBusinessDays,
  normalizePhone,
  clientSchema,
  saleSchema,
  paymentSchema,
  totalSaleLines,
  receivableStatus,
  collectionWhatsApp,
} from '../../packages/domain/src/commerce';
const sale = () => ({
  clientId: randomUUID(),
  condition: 'credit',
  soldAt: '2026-11-04T14:00:00Z',
  lines: [
    {
      configurationId: randomUUID(),
      presentation: 'box',
      quantity: 5,
      priceBasis: 'usd_cash_promo',
      agreedUnitUsd: '38',
    },
  ],
});
describe('contratos comerciales y precisión', () => {
  it('crédito sin fecha ni abono es válido; cero no crea un pago', () => {
    const parsed = saleSchema.parse(sale());
    expect(parsed.dueDate).toBeNull();
    expect(parsed.initialPayment).toBeUndefined();
    expect(
      saleSchema.safeParse({
        ...sale(),
        initialPayment: {
          currency: 'USD',
          amount: '0',
          method: 'Efectivo',
          receivedAt: '2026-11-04T14:00:00Z',
        },
      }).success,
    ).toBe(false);
  });
  it('presentaciones enteras y precio pactado sin permitir piezas ni referencias del navegador', () => {
    const data = sale();
    expect(saleSchema.parse(data).lines[0].agreedUnitUsd).toBe('38.0000');
    expect(
      saleSchema.safeParse({ ...data, lines: [{ ...data.lines[0], presentation: 'piece' }] })
        .success,
    ).toBe(false);
    expect(
      saleSchema.safeParse({ ...data, lines: [{ ...data.lines[0], quantity: 1.5 }] }).success,
    ).toBe(false);
    expect(
      saleSchema.safeParse({ ...data, lines: [{ ...data.lines[0], referenceUnitUsd: '0.01' }] })
        .success,
    ).toBe(false);
  });
  it('5 por 38 son 190; redondea cada renglón de forma decimal antes de sumar', () => {
    expect(totalSaleLines([{ quantity: 5, agreedUnitUsd: '38', referenceUnitUsd: '40' }])).toEqual({
      totalUsd: '190.00',
      discountUsd: '10.00',
    });
    expect(
      totalSaleLines([
        { quantity: 1, agreedUnitUsd: '0.005', referenceUnitUsd: '0.005' },
        { quantity: 1, agreedUnitUsd: '0.005', referenceUnitUsd: '0.005' },
      ]).totalUsd,
    ).toBe('0.02');
  });
  it('abonos positivos y reparto sin comprobantes duplicados; USDT no confirmado se rechaza', () => {
    const id = randomUUID(),
      data = {
        clientId: randomUUID(),
        currency: 'USD',
        amount: '80',
        method: 'Efectivo',
        receivedAt: '2026-11-04T14:00:00Z',
        applications: [{ saleId: id, amountUsd: '80' }],
      };
    expect(paymentSchema.parse(data).amount).toBe('80.00');
    expect(
      paymentSchema.safeParse({
        ...data,
        applications: [...data.applications, ...data.applications],
      }).success,
    ).toBe(false);
    expect(paymentSchema.safeParse({ ...data, currency: 'USDT' }).success).toBe(false);
  });
  it('teléfono exige país explícito y WhatsApp lleva saldo actual sin envío automático', () => {
    expect(normalizePhone('+58 (412) 123-4567')).toBe('+584121234567');
    expect(clientSchema.safeParse({ name: 'DEMO cliente', phone: '04121234567' }).success).toBe(
      false,
    );
    const url = collectionWhatsApp('+584121234567', 'Ana & José', 'V-00000001', '120');
    expect(url).toMatch(/^https:\/\/wa.me\/584121234567\?text=/);
    expect(decodeURIComponent(url!)).toContain('USD 120.00');
    expect(collectionWhatsApp(null, 'Ana', 'V-1', '120')).toBeNull();
    expect(collectionWhatsApp('+584121234567', 'Ana', 'V-1', '0')).toBeNull();
  });
  it('Caracas cambia de día a las 04:00 UTC y plazos cruzan meses/años correctamente', () => {
    expect(businessDate(new Date('2026-11-05T03:59:59Z'))).toBe('2026-11-04');
    expect(businessDate(new Date('2026-11-05T04:00:00Z'))).toBe('2026-11-05');
    expect(addBusinessDays('2026-12-25', 15)).toBe('2027-01-09');
  });
  it('pago completo elimina pendiente y recordatorio interno no inventa vencimiento', () => {
    expect(receivableStatus('0', '2026-01-01', '2026-11-04')).toBe('paid');
    expect(receivableStatus('10', null, '2026-11-04')).toBe('pending');
    expect(receivableStatus('10', '2026-11-03', '2026-11-04')).toBe('overdue');
    expect(receivableStatus('10', '2026-11-05', '2026-11-04')).toBe('due_soon');
  });
});
