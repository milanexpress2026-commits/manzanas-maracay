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
