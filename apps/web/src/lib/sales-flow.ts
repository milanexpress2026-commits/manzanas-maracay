import Decimal from 'decimal.js';
import type { Configuration, Presentation, PriceBasis } from '@mm/domain';
import { normalizedMoney } from './commercial-ui';

export type SaleDraftLine = {
  key: number;
  configurationId: string;
  presentation: Presentation | '';
  quantity: string;
  priceBasis: PriceBasis | '';
  agreedUnitUsd: string;
  priceEdited: boolean;
};
export const emptySaleLine = (key: number): SaleDraftLine => ({
  key,
  configurationId: '',
  presentation: '',
  quantity: '1',
  priceBasis: '',
  agreedUnitUsd: '',
  priceEdited: false,
});
export function salePresentations(config: Configuration) {
  return config.allowedPresentations.filter(
    (p) =>
      p === 'box' ||
      (p === 'blister'
        ? config.blistersPerBox !== null
        : config.halfPreparation !== 'pending' && config.halfPreparation !== 'none'),
  );
}
export function salePrices(config: Configuration | undefined, presentation: Presentation | '') {
  const prices = config?.prices.find((p) => p.presentation === presentation);
  return [
    { basis: 'usd_cash_promo' as const, label: 'Promocional divisa', amount: prices?.promoUsd },
    { basis: 'ves_regular' as const, label: 'Regular · Bs. BCV', amount: prices?.regularUsd },
  ].filter((p): p is { basis: PriceBasis; label: string; amount: string } => p.amount != null);
}
export function saleReference(config: Configuration | undefined, line: SaleDraftLine) {
  return (
    salePrices(config, line.presentation).find((p) => p.basis === line.priceBasis)?.amount ?? null
  );
}
export function changeSaleLine(
  line: SaleDraftLine,
  changes: Partial<SaleDraftLine>,
  config?: Configuration,
): SaleDraftLine {
  const next = { ...line, ...changes };
  if (changes.configurationId !== undefined) {
    const allowed = config ? salePresentations(config) : [];
    next.presentation = allowed.length === 1 ? allowed[0] : '';
  }
  if (changes.configurationId !== undefined || changes.presentation !== undefined) {
    const options = salePrices(config, next.presentation);
    // Agreement belongs to the sale, never to its cash/credit or later payment choice.
    next.priceBasis = options.length === 1 ? options[0].basis : '';
    next.agreedUnitUsd = options.length === 1 ? options[0].amount : '';
    next.priceEdited = false;
  } else if (changes.priceBasis !== undefined && !line.priceEdited) {
    next.agreedUnitUsd = saleReference(config, next) ?? '';
  }
  if (changes.agreedUnitUsd !== undefined) next.priceEdited = true;
  return next;
}
export function saleLineTotal(line: SaleDraftLine) {
  const amount = normalizedMoney(line.agreedUnitUsd);
  if (!/^\d{1,11}(\.\d{1,4})?$/.test(amount) || !/^\d{1,4}$/.test(line.quantity))
    return new Decimal(0);
  return new Decimal(amount).times(line.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export type SaleFormDraft = {
  clientId: string;
  condition: 'cash' | 'credit';
  date: string;
  due: string;
  reminder: string;
  notes: string;
  lines: SaleDraftLine[];
  nextKey: number;
  paid: string;
  currency: 'USD' | 'VES' | 'USDT';
  method: string;
};
// Client-navigation continuity only: no cookies, Web Storage, database or server-global data.
let navigationDraft: { scope: string; expiresAt: number; draft: SaleFormDraft } | null = null;
export function keepSaleDraft(scope: string, draft: SaleFormDraft) {
  if (!('window' in globalThis)) return;
  navigationDraft = { scope, expiresAt: Date.now() + 30 * 60_000, draft: structuredClone(draft) };
}
export function takeSaleDraft(scope: string): SaleFormDraft | null {
  if (!('window' in globalThis)) return null;
  const saved = navigationDraft;
  navigationDraft = null;
  return saved && saved.scope === scope && saved.expiresAt > Date.now() ? saved.draft : null;
}
export function clearSaleDraft() {
  if ('window' in globalThis) navigationDraft = null;
}
