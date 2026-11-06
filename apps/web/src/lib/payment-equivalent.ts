import { settleQuotedVes } from '@mm/domain';

export type BrowserQuote = {
  rate: string;
  source?: string;
  verifiedAt?: string;
  validFrom: string;
  validUntil: string;
};

// UI preview uses the same forward-rounding rule as the server. A missing or
// stale quote remains unavailable; no inferred quote or tolerance is introduced.
export function paymentEquivalent(
  amount: string,
  quote: BrowserQuote,
  basis: 'divisa' | 'bcv',
  intendedUsd?: string,
  now = new Date(),
) {
  if (quote.source !== 'BCV' && quote.source !== 'BINANCE_P2P_BUY')
    throw new Error('La fuente de la cotización no está verificada.');
  return settleQuotedVes(
    amount,
    {
      rate: quote.rate,
      source: quote.source,
      verifiedAt: new Date(quote.verifiedAt ?? ''),
      validFrom: new Date(quote.validFrom),
      validUntil: new Date(quote.validUntil),
    },
    basis,
    now,
    intendedUsd,
  ).amountUsd;
}
