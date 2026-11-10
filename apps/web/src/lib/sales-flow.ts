import Decimal from 'decimal.js';
import type { Configuration, Presentation, PriceBasis, SettlementBasis } from '@mm/domain';
import { effectiveSalePresentations } from '@mm/domain';
import { caracasInstant, normalizedMoney } from './commercial-ui';

export const paymentChoices = [
  { id: 'usd_cash', label: 'Efectivo USD', currency: 'USD', method: 'usd_cash', basis: null },
  {
    id: 'ves_bcv',
    label: 'Bolívares a tasa BCV',
    currency: 'VES',
    method: 'bolivares',
    basis: 'bcv',
  },
  { id: 'usdt_transfer', label: 'USDT', currency: 'USDT', method: 'usdt_transfer', basis: null },
  {
    id: 'ves_usdt',
    label: 'Bolívares a tasa Binance/USDT compra',
    currency: 'VES',
    method: 'bolivares',
    basis: 'divisa',
  },
] as const;
export type PaymentChoice = (typeof paymentChoices)[number]['id'];
export const paymentChoiceDetails = (choice: PaymentChoice) =>
  paymentChoices.find((item) => item.id === choice)!;
export function paymentChoiceUnavailable(
  choice: PaymentChoice,
  basis: SettlementBasis | null,
  quotes: { bcv: boolean; usdt: boolean },
  mixed = false,
): string | null {
  const option = paymentChoiceDetails(choice);
  if (option.currency !== 'VES') return null;
  if (mixed) return 'Separa los comprobantes por acuerdo para cobrar en bolívares.';
  if (!basis) return 'Selecciona primero el acuerdo de la venta o un comprobante pendiente.';
  const normalized = basis === 'legacy_bcv' ? 'bcv' : basis;
  if (option.basis !== normalized)
    return option.basis === 'bcv'
      ? 'Requiere un acuerdo regular/BCV; conserva el precio pactado y elige otro cobro.'
      : 'Requiere un acuerdo promocional/divisa; conserva el precio pactado y elige otro cobro.';
  if (!(option.basis === 'bcv' ? quotes.bcv : quotes.usdt))
    return (
      'Cotización ' +
      (option.basis === 'bcv' ? 'BCV' : 'USDT compra') +
      ' no disponible o vencida. Actualiza la tasa o elige USD/USDT.'
    );
  return null;
}

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
  return effectiveSalePresentations(config).filter(
    (p) =>
      p === 'box' ||
      (p === 'blister'
        ? config.blistersPerBox !== null
        : (config.packingModel === 'blister' && config.blistersPerBox !== null) ||
          config.packingModel === 'halves' ||
          (config.halfPreparation !== 'pending' && config.halfPreparation !== 'none')),
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
    // A new product/presentation always requires the price agreed for this sale.
    // Historical lists are not an input or a suggested price for new operations.
    next.priceBasis = '';
    next.agreedUnitUsd = '';
    next.priceEdited = false;
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

export function saleReviewInstant(date: string, dateEdited: boolean, now = new Date()) {
  return dateEdited ? caracasInstant(date) : now.toISOString();
}

export type SaleFormDraft = {
  clientId: string;
  settlementBasis?: 'divisa' | 'bcv' | '';
  condition: 'cash' | 'credit';
  date: string;
  dateEdited: boolean;
  due: string;
  reminder: string;
  notes: string;
  lines: SaleDraftLine[];
  nextKey: number;
  paid: string;
  addPayment: boolean;
  paymentChoice: PaymentChoice;
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
