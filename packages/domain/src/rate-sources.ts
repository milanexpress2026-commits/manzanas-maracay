import Decimal from 'decimal.js';

export const BCV_SOURCE_URL = 'https://www.bcv.org.ve/';
export const USDT_SOURCE_URL =
  'https://www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price?fiat=VES&asset=USDT&tradeType=BUY';
export type CollectedRate = {
  rate: string;
  source: 'BCV' | 'BINANCE_P2P_BUY';
  sourceUrl: string;
  validFrom: Date;
  validUntil: Date;
};

export type BcvObservation = {
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
const DAY = 86400000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const BCV_CONTINUITY_PREFIX = 'bcv-continuity-v1:';
export type BcvContinuityMetadata = {
  policy: 'last_official_until_next_value_date_v1';
  originalValueDate: string;
  parentId: string;
  nextId: string;
};

function officialDay(value: Date) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return null;
  const day = value.toISOString().slice(0, 10);
  return value.getTime() === new Date(`${day}T00:00:00-04:00`).getTime() ? day : null;
}

/** Canonical metadata rejects duplicate/extra keys and malformed dates or identities. */
export function readBcvContinuityMetadata(value: string): BcvContinuityMetadata | null {
  if (!value.startsWith(BCV_CONTINUITY_PREFIX)) return null;
  try {
    const raw = value.slice(BCV_CONTINUITY_PREFIX.length);
    const parsed = JSON.parse(raw) as BcvContinuityMetadata;
    const metadata: BcvContinuityMetadata = {
      policy: parsed.policy,
      originalValueDate: parsed.originalValueDate,
      parentId: parsed.parentId,
      nextId: parsed.nextId,
    };
    if (
      raw !== JSON.stringify(metadata) ||
      metadata.policy !== 'last_official_until_next_value_date_v1' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(metadata.originalValueDate) ||
      officialDay(new Date(`${metadata.originalValueDate}T00:00:00-04:00`)) !==
        metadata.originalValueDate ||
      !UUID.test(metadata.parentId) ||
      !UUID.test(metadata.nextId) ||
      metadata.parentId === metadata.nextId
    )
      return null;
    return metadata;
  } catch {
    return null;
  }
}

export function isOriginalBcvObservation(row: BcvObservation, at: Date): boolean {
  try {
    const url = new URL(row.source_url);
    return (
      row.source === 'BCV' &&
      UUID.test(row.id) &&
      url.protocol === 'https:' &&
      ['bcv.org.ve', 'www.bcv.org.ve'].includes(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^[a-f0-9]{64}$/.test(row.source_hash) &&
      exactRate(row.rate) === row.rate &&
      [
        'automatic-strict-tls-v1',
        'policy_explicit_user_last_official_until_next_value_date_v1',
      ].includes(row.verified_by) &&
      !!officialDay(row.valid_from) &&
      !!officialDay(row.valid_until) &&
      row.valid_until > row.valid_from &&
      row.valid_until.getTime() - row.valid_from.getTime() <= 4 * DAY &&
      [row.fetched_at, row.verified_at, at].every(
        (date) => date instanceof Date && Number.isFinite(date.getTime()),
      ) &&
      row.fetched_at <= row.verified_at &&
      row.verified_at <= at
    );
  } catch {
    return false;
  }
}

/** Application policy requested by the owner, not a BCV calendar/expiry rule. */
export function planBcvContinuity(
  previous: BcvObservation,
  next: BcvObservation,
  fresh: CollectedRate,
  fetchedAt: Date,
  verifiedAt: Date,
): Omit<BcvObservation, 'id'> | null {
  if (previous.valid_until > verifiedAt) return null;
  if (
    !isOriginalBcvObservation(previous, verifiedAt) ||
    !isOriginalBcvObservation(next, verifiedAt) ||
    previous.id === next.id ||
    !(fetchedAt instanceof Date) ||
    !Number.isFinite(fetchedAt.getTime()) ||
    fetchedAt > verifiedAt ||
    verifiedAt.getTime() - fetchedAt.getTime() > 5 * 60 * 1000 ||
    fresh.source !== 'BCV' ||
    fresh.sourceUrl !== BCV_SOURCE_URL ||
    fresh.rate !== next.rate ||
    fresh.validFrom.getTime() !== next.valid_from.getTime() ||
    fresh.validUntil.getTime() !== next.valid_until.getTime() ||
    next.valid_from <= verifiedAt ||
    previous.valid_from > verifiedAt ||
    next.valid_from <= previous.valid_until ||
    next.valid_from.getTime() - previous.valid_from.getTime() > 4 * DAY
  )
    throw new Error('No hay evidencia oficial inequívoca para continuar la última tasa.');
  const metadata: BcvContinuityMetadata = {
    policy: 'last_official_until_next_value_date_v1',
    originalValueDate: officialDay(previous.valid_from)!,
    parentId: previous.id,
    nextId: next.id,
  };
  return {
    rate: previous.rate,
    source: 'BCV',
    source_url: previous.source_url,
    source_hash: previous.source_hash,
    valid_from: new Date(previous.valid_until),
    valid_until: new Date(next.valid_from),
    fetched_at: new Date(previous.fetched_at),
    verified_at: new Date(verifiedAt),
    verified_by: BCV_CONTINUITY_PREFIX + JSON.stringify(metadata),
  };
}

/** Readers recheck both immutable parents; a well-formed JSON string alone is insufficient. */
export function validateBcvContinuity(
  row: BcvObservation,
  parents: readonly BcvObservation[],
): string | null {
  const metadata = readBcvContinuityMetadata(row.verified_by);
  if (!metadata || parents.length !== 2 || !UUID.test(row.id)) return null;
  const previous = parents.find((parent) => parent.id === metadata.parentId);
  const next = parents.find((parent) => parent.id === metadata.nextId);
  if (!previous || !next || [previous.id, next.id].includes(row.id)) return null;
  try {
    const expected = planBcvContinuity(
      previous,
      next,
      {
        rate: next.rate,
        source: 'BCV',
        sourceUrl: BCV_SOURCE_URL,
        validFrom: next.valid_from,
        validUntil: next.valid_until,
      },
      row.verified_at,
      row.verified_at,
    );
    if (!expected || metadata.originalValueDate !== officialDay(previous.valid_from)) return null;
    for (const key of ['rate', 'source', 'source_url', 'source_hash', 'verified_by'] as const)
      if (row[key] !== expected[key]) return null;
    for (const key of ['valid_from', 'valid_until', 'fetched_at', 'verified_at'] as const)
      if (row[key].getTime() !== expected[key].getTime()) return null;
    return metadata.originalValueDate;
  } catch {
    return null;
  }
}

function exactRate(value: string) {
  if (!/^\d{1,12}(?:\.\d{1,8})?$/.test(value)) throw new Error('Formato de tasa no reconocido.');
  const rate = new Decimal(value);
  if (!rate.isFinite() || rate.lte(0)) throw new Error('Tasa no positiva.');
  return rate.toFixed(8);
}

/** Parse only BCV's USD section and its adjacent official value date, never other currencies. */
export function parseBcvSource(html: string, fetchedAt: Date): CollectedRate {
  const sections = [...html.matchAll(/id=["']dolar["']/g)];
  if (sections.length !== 1 || !Number.isFinite(fetchedAt.getTime()))
    throw new Error('La sección USD oficial no es única.');
  const section = html.slice(sections[0]!.index, sections[0]!.index + 2200);
  const amounts = [
    ...section.matchAll(/<strong\b[^>]*>\s*(\d+(?:\.\d{3})*,\d{1,8})\s*<\/strong>/g),
  ];
  const dates = [
    ...section.matchAll(
      /Fecha\s+Valor:\s*<span\b[^>]*\bcontent=["'](\d{4}-\d{2}-\d{2}T00:00:00-04:00)["']/g,
    ),
  ];
  if (amounts.length !== 1 || dates.length !== 1)
    throw new Error('BCV cambió el formato o la fecha valor.');
  const validFrom = new Date(dates[0]![1]!);
  if (
    !Number.isFinite(validFrom.getTime()) ||
    validFrom.toISOString().slice(0, 10) !== dates[0]![1]!.slice(0, 10)
  )
    throw new Error('Fecha BCV inválida.');
  const validUntil = new Date(validFrom.getTime() + 86400000);
  if (validUntil <= fetchedAt || validFrom.getTime() > fetchedAt.getTime() + 4 * 86400000)
    throw new Error('Fecha BCV vencida o demasiado futura.');
  return {
    rate: exactRate(amounts[0]![1]!.replaceAll('.', '').replace(',', '.')),
    source: 'BCV',
    sourceUrl: BCV_SOURCE_URL,
    validFrom,
    validUntil,
  };
}

/** Binance's own public BUY quote, all available methods; no third-party aggregate. */
export function parseUsdtSource(raw: string, fetchedAt: Date): CollectedRate {
  let priceOwner: unknown;
  let priceToken: string | undefined;
  // Node 24 preserves the primitive's original token in the reviver context.
  // Bind that token to its actual parent instead of searching another JSON branch.
  const data = JSON.parse(
    raw,
    function (this: unknown, key: string, value: unknown, context?: { source?: string }) {
      if (key === 'price') {
        priceOwner = this;
        priceToken = context?.source;
      }
      return value;
    },
  ) as {
    success?: boolean;
    code?: string;
    data?: { asset?: string; fiat?: string; price?: unknown };
  } | null;
  // JSON.parse overwrites duplicate keys. Count complete JSON string tokens first,
  // decoding escaped keys too, and reject an ambiguous data/price envelope.
  let dataKeys = 0;
  let priceKeys = 0;
  for (const token of raw.matchAll(/"(?:[^"\\]|\\.)*"/gs)) {
    if (!/^\s*:/.test(raw.slice(token.index + token[0].length))) continue;
    const key: unknown = JSON.parse(token[0]);
    if (key === 'data') dataKeys++;
    if (key === 'price') priceKeys++;
  }
  const price = priceToken?.match(/^(?:"(\d{1,12}(?:\.\d{1,8})?)"|(\d{1,12}(?:\.\d{1,8})?))$/);
  const decimal = price?.[1] ?? price?.[2];
  if (
    !Number.isFinite(fetchedAt.getTime()) ||
    data?.success !== true ||
    data?.code !== '000000' ||
    data?.data?.asset !== 'USDT' ||
    data?.data?.fiat !== 'VES' ||
    priceOwner !== data.data ||
    dataKeys !== 1 ||
    priceKeys !== 1 ||
    !decimal
  )
    throw new Error('No hay una cotización USDT/VES de compra válida.');
  return {
    rate: exactRate(decimal),
    source: 'BINANCE_P2P_BUY',
    sourceUrl: USDT_SOURCE_URL,
    validFrom: new Date(fetchedAt),
    validUntil: new Date(fetchedAt.getTime() + 10 * 60 * 1000),
  };
}
