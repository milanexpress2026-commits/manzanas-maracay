import Decimal from 'decimal.js';

export type OfficialRateReference = {
  usage: 'display_only';
  source: 'BCV';
  rate: string;
  sourceUrl: string;
  sourceHash: string;
  validFrom: string;
  validUntil: string;
  officialValueDate?: string;
  fetchedAt: string;
  verifiedAt: string;
};

/** The value date belongs to the BCV publication, not a later technical cache interval. */
export function officialRateValueDate(validFrom: string, officialValueDate?: string): Date | null {
  const start = new Date(validFrom);
  if (!Number.isFinite(start.getTime())) return null;
  if (officialValueDate === undefined) return start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(officialValueDate)) return null;
  const value = new Date(officialValueDate + 'T04:00:00.000Z');
  if (
    !Number.isFinite(value.getTime()) ||
    value.toISOString().slice(0, 10) !== officialValueDate ||
    value > start
  )
    return null;
  return value;
}

/** Presentation only: never returns a rateId or changes payment availability. */
export function officialReferenceDisplay(
  reference: OfficialRateReference | null | undefined,
  at = new Date(),
) {
  if (!reference || reference.usage !== 'display_only' || reference.source !== 'BCV') return null;
  try {
    const source = new URL(reference.sourceUrl);
    const validFrom = new Date(reference.validFrom),
      validUntil = new Date(reference.validUntil),
      fetchedAt = new Date(reference.fetchedAt),
      verifiedAt = new Date(reference.verifiedAt);
    if (
      source.protocol !== 'https:' ||
      !['bcv.org.ve', 'www.bcv.org.ve'].includes(source.hostname) ||
      source.port ||
      source.username ||
      source.password ||
      source.hash ||
      source.search ||
      !/^[a-f0-9]{64}$/.test(reference.sourceHash) ||
      !/^\d{1,12}(?:\.\d{1,8})?$/.test(reference.rate) ||
      [validFrom, validUntil, fetchedAt, verifiedAt, at].some(
        (date) => !Number.isFinite(date.getTime()),
      ) ||
      validFrom > at ||
      validUntil <= validFrom ||
      fetchedAt > verifiedAt ||
      verifiedAt > at
    )
      return null;
    const amount = new Decimal(reference.rate);
    if (!amount.isFinite() || amount.lte(0)) return null;
    const valueDate = officialRateValueDate(reference.validFrom, reference.officialValueDate);
    if (!valueDate) return null;
    return {
      amount: amount.toFixed(8).replace(/0+$/, '').replace(/\.$/, '').replace('.', ','),
      valueDate: new Intl.DateTimeFormat('es-VE', {
        timeZone: 'America/Caracas',
        dateStyle: 'short',
      }).format(valueDate),
      verifiedAt: new Intl.DateTimeFormat('es-VE', {
        timeZone: 'America/Caracas',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(verifiedAt),
      sourceUrl: source.href,
    };
  } catch {
    return null;
  }
}
