import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Configuration } from '../../packages/domain/src/index';
import {
  emptySaleLine,
  changeSaleLine,
  saleLineTotal,
  keepSaleDraft,
  takeSaleDraft,
  clearSaleDraft,
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

describe('borrador temporal de navegación', () => {
  const draft: SaleFormDraft = {
    clientId: 'client',
    condition: 'cash',
    date: '2026-11-05T12:00',
    due: '',
    reminder: '',
    notes: '',
    lines: [emptySaleLine(1)],
    nextKey: 2,
    paid: '0',
    currency: 'USD',
    method: 'usd_cash',
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
