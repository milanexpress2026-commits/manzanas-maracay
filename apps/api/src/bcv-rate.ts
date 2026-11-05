import Decimal from 'decimal.js';
import type { VerifiedRate } from '../../../packages/domain/src/index';

export type HistoricalOfficialRate = VerifiedRate & {
  id: string;
  sourceUrl: string;
  sourceHash: string;
  fetchedAt: Date;
};
export type HistoricalUsdtRate = Omit<HistoricalOfficialRate, 'source'> & {
  source: 'BINANCE_P2P_BUY';
};

export function selectUsdtRate(
  rows: readonly OfficialRateCacheRow[],
  at: Date,
): HistoricalUsdtRate | null {
  if (rows.length !== 1 || !Number.isFinite(at.getTime())) return null;
  const row = rows[0]!;
  if (
    row.source !== 'BINANCE_P2P_BUY' ||
    row.source_url !==
      'https://www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price?fiat=VES&asset=USDT&tradeType=BUY'
  )
    return null;
  const checked = selectOfficialRate(
    [{ ...row, source: 'BCV', source_url: 'https://www.bcv.org.ve/' }],
    at,
  );
  if (!checked || row.valid_until.getTime() - row.valid_from.getTime() > 15 * 60 * 1000)
    return null;
  return { ...checked, source: 'BINANCE_P2P_BUY', sourceUrl: row.source_url };
}

export type OfficialRateCacheRow = {
  id: string;
  rate: string;
  source: string;
  source_url: string;
  source_hash: string;
  valid_from: Date;
  valid_until: Date;
  fetched_at: Date;
  verified_at: Date;
  verified_by: string;
};

/** Only the private, append-only cache can supply candidates. No browser rate is accepted. */
export function selectOfficialRate(
  rows: readonly OfficialRateCacheRow[],
  at: Date,
): HistoricalOfficialRate | null {
  if (!Number.isFinite(at.getTime()) || rows.length !== 1) return null;
  const row = rows[0];
  if (!row) return null;
  try {
    const source = new URL(row.source_url);
    const dates = [row.valid_from, row.valid_until, row.fetched_at, row.verified_at];
    if (
      row.source !== 'BCV' ||
      source.protocol !== 'https:' ||
      !['bcv.org.ve', 'www.bcv.org.ve'].includes(source.hostname) ||
      source.port ||
      source.username ||
      source.password ||
      source.hash ||
      source.search ||
      !/^[a-f0-9]{64}$/.test(row.source_hash) ||
      !row.verified_by?.trim() ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id) ||
      !/^\d{1,12}(?:\.\d{1,8})?$/.test(row.rate) ||
      dates.some((date) => !(date instanceof Date) || !Number.isFinite(date.getTime()))
    )
      return null;
    const value = new Decimal(row.rate);
    if (
      !value.isFinite() ||
      value.lte(0) ||
      row.valid_until <= row.valid_from ||
      row.fetched_at > row.verified_at ||
      row.verified_at > at ||
      at < row.valid_from ||
      at >= row.valid_until
    )
      return null;
    return {
      id: row.id,
      rate: value.toFixed(8),
      source: 'BCV',
      sourceUrl: row.source_url,
      sourceHash: row.source_hash,
      fetchedAt: new Date(row.fetched_at),
      verifiedAt: new Date(row.verified_at),
      validFrom: new Date(row.valid_from),
      validUntil: new Date(row.valid_until),
    };
  } catch {
    return null;
  }
}

export async function readOfficialRate(
  readRows: (at: Date) => Promise<OfficialRateCacheRow[]>,
  at: Date,
): Promise<HistoricalOfficialRate | null> {
  if (!Number.isFinite(at.getTime())) return null;
  try {
    return selectOfficialRate(await readRows(at), at);
  } catch {
    // Missing cache/permissions/database is never a reason to invent or reuse a stale rate.
    return null;
  }
}
