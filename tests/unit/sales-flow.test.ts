import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Configuration } from '../../packages/domain/src/index';
import {
  emptySaleLine,
  changeSaleLine,
  saleLineTotal,
  saleReviewInstant,
  keepSaleDraft,
  takeSaleDraft,
  clearSaleDraft,
  paymentChoices,
  paymentChoiceDetails,
  paymentChoiceUnavailable,
  type SaleFormDraft,
} from '../../apps/web/src/lib/sales-flow';

const config = (prices: Configuration['prices']): Configuration => ({
  id: 'packing',
  variantId: 'variant',
  fruitId: 'fruit',
  varietyId: null,
  caliberId: null,
  fruit: 'Kiwi',
  variety: null,
  caliber: null,
  commercialLine: '',
  packingModel: 'whole',
  blistersPerBox: null,
  halfPreparation: 'none',
  allowedPresentations: ['box'],
  boxWeightKg: null,
  confirmationStatus: 'confirmed',
  version: 1,
  notes: '',
  prices,
});
afterEach(() => {
  clearSaleDraft();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('cuatro opciones de cobro conservan moneda y acuerdo', () => {
  it('ambas opciones de bolívares usan VES y el método histórico, sin inventar otra moneda', () => {
    expect(paymentChoices.map(({ id, currency, method }) => ({ id, currency, method }))).toEqual([
      { id: 'usd_cash', currency: 'USD', method: 'usd_cash' },
      { id: 'ves_bcv', currency: 'VES', method: 'bolivares' },
      { id: 'usdt_transfer', currency: 'USDT', method: 'usdt_transfer' },
      { id: 'ves_usdt', currency: 'VES', method: 'bolivares' },
    ]);
    expect(paymentChoiceDetails('ves_usdt').basis).toBe('divisa');
  });
  it('una cotización de otra fuente nunca habilita el cobro VES del acuerdo', () => {
    expect(paymentChoiceUnavailable('ves_usdt', 'divisa', { bcv: true, usdt: false })).toContain(
      'USDT compra no disponible',
    );
    expect(paymentChoiceUnavailable('ves_bcv', 'bcv', { bcv: false, usdt: true })).toContain(
      'BCV no disponible',
    );
    expect(paymentChoiceUnavailable('ves_usdt', 'divisa', { bcv: false, usdt: true })).toBeNull();
    expect(
      paymentChoiceUnavailable('ves_bcv', 'legacy_bcv', { bcv: true, usdt: false }),
    ).toBeNull();
  });
  it('bloquea un método incompatible sin transformar el acuerdo ni el método elegido', () => {
    const quotes = { bcv: true, usdt: true };
    expect(paymentChoiceUnavailable('ves_bcv', 'divisa', quotes)).toContain(
      'Requiere un acuerdo regular/BCV',
    );
    expect(paymentChoiceUnavailable('ves_usdt', 'bcv', quotes)).toContain(
      'Requiere un acuerdo promocional/divisa',
    );
    expect(paymentChoiceUnavailable('ves_usdt', 'legacy_bcv', quotes)).not.toBeNull();
  });
  it('permite USD/USDT sin cotización o con acuerdos mezclados, pero exige separar VES', () => {
    const quotes = { bcv: false, usdt: false };
    for (const method of ['usd_cash', 'usdt_transfer'] as const) {
      expect(paymentChoiceUnavailable(method, null, quotes)).toBeNull();
      expect(paymentChoiceUnavailable(method, null, quotes, true)).toBeNull();
    }
    for (const method of ['ves_bcv', 'ves_usdt'] as const) {
      expect(paymentChoiceUnavailable(method, null, { bcv: true, usdt: true })).not.toBeNull();
      expect(paymentChoiceUnavailable(method, null, { bcv: true, usdt: true }, true)).toContain(
        'Separa los comprobantes',
      );
    }
  });
});

describe('venta rápida: decisiones explícitas y dinero exacto', () => {
  it('elige presentación y precio únicos; no inventa la lista que falta', () => {
    const product = config([{ presentation: 'box', promoUsd: '40.0000', regularUsd: null }]);
    const line = changeSaleLine(emptySaleLine(1), { configurationId: product.id }, product);
    expect(line).toMatchObject({
      presentation: 'box',
      priceBasis: 'usd_cash_promo',
      agreedUnitUsd: '40.0000',
    });
  });
  it('requiere el acuerdo cuando existen ambas listas, incluso si hoy cuestan lo mismo', () => {
    for (const regularUsd of ['45.0000', '40.0000']) {
      const product = config([{ presentation: 'box', promoUsd: '40.0000', regularUsd }]);
      const line = changeSaleLine(emptySaleLine(1), { configurationId: product.id }, product);
      expect(line.priceBasis).toBe('');
      expect(line.agreedUnitUsd).toBe('');
    }
  });
  it('conserva un precio negociado al seleccionar otro acuerdo de lista', () => {
    const product = config([{ presentation: 'box', promoUsd: '40.0000', regularUsd: '45.0000' }]);
    const selected = changeSaleLine(emptySaleLine(1), { configurationId: product.id }, product);
    const promotional = changeSaleLine(selected, { priceBasis: 'usd_cash_promo' }, product);
    const negotiated = changeSaleLine(promotional, { agreedUnitUsd: '38,50' }, product);
    expect(changeSaleLine(negotiated, { priceBasis: 'ves_regular' }, product)).toMatchObject({
      priceBasis: 'ves_regular',
      agreedUnitUsd: '38,50',
      priceEdited: true,
    });
  });
  it('recalcula subtotal con redondeo por línea y nunca conserva un cobro previo', () => {
    const line = { ...emptySaleLine(1), quantity: '3', agreedUnitUsd: '0,3350' };
    expect(saleLineTotal(line).toFixed(2)).toBe('1.01');
    expect(saleLineTotal({ ...line, quantity: '2' }).toFixed(2)).toBe('0.67');
    expect(saleLineTotal({ ...line, quantity: '1e3' }).toFixed(2)).toBe('0.00');
  });
});

describe('fecha de venta al revisar', () => {
  it('conserva segundos y milisegundos para vender después de una recepción del mismo minuto', () => {
    const receivedAt = new Date('2026-11-05T16:23:41.250Z');
    const reviewedAt = new Date('2026-11-05T16:23:44.830Z');
    const soldAt = saleReviewInstant('2026-11-05T12:23', false, reviewedAt);
    expect(soldAt).toBe('2026-11-05T16:23:44.830Z');
    expect(new Date(soldAt).valueOf()).toBeGreaterThan(receivedAt.valueOf());
  });
  it('respeta la fecha manual de Venezuela aunque la revisión ocurra después', () => {
    expect(
      saleReviewInstant('2026-11-04T09:35', true, new Date('2026-11-05T16:23:44.830Z')),
    ).toBe('2026-11-04T13:35:00.000Z');
    expect(() => saleReviewInstant('fecha inválida', true)).toThrow('fecha y hora válidas');
  });
});

describe('borrador temporal de navegación', () => {
  const draft: SaleFormDraft = {
    clientId: 'client',
    condition: 'cash',
    date: '2026-11-05T12:00',
    dateEdited: true,
    due: '',
    reminder: '',
    notes: '',
    lines: [emptySaleLine(1)],
    nextKey: 2,
    paid: '0',
    addPayment: false,
    paymentChoice: 'usd_cash',
  };
  it('no lee ni conserva datos durante render en servidor', () => {
    keepSaleDraft('actor', draft);
    expect(takeSaleDraft('actor')).toBeNull();
  });
  it('devuelve una copia una vez, solo para la misma sesión y durante 30 minutos', () => {
    vi.stubGlobal('window', {});
    vi.useFakeTimers();
    keepSaleDraft('test:actor', draft);
    const restored = takeSaleDraft('test:actor');
    expect(restored).toEqual(draft);
    expect(restored).not.toBe(draft);
    expect(takeSaleDraft('test:actor')).toBeNull();
    keepSaleDraft('test:actor', draft);
    expect(takeSaleDraft('production:actor')).toBeNull();
    keepSaleDraft('test:actor', draft);
    vi.advanceTimersByTime(30 * 60_000);
    expect(takeSaleDraft('test:actor')).toBeNull();
  });
});
