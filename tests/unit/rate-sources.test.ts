import { describe, it, expect } from 'vitest';
import { parseBcvSource, parseUsdtSource } from '../../packages/domain/src/rate-sources';
import { selectUsdtRate, type OfficialRateCacheRow } from '../../apps/api/src/bcv-rate';
const at = new Date('2026-11-05T13:00:00Z');
const html = (price = '894,88760000', date = '2026-11-05') =>
  `<div id="euro"><strong>999,99</strong></div><div id="dolar"><span>USD</span><strong>${price}</strong></div>Fecha Valor: <span property="dc:date" content="${date}T00:00:00-04:00">fecha</span>`;
describe('official source parsing', () => {
  it('reads the USD section, exact decimal and official Caracas value date', () => {
    const rate = parseBcvSource(html(), at);
    expect(rate.rate).toBe('894.88760000');
    expect(rate.validFrom.toISOString()).toBe('2026-11-05T04:00:00.000Z');
    expect(rate.validUntil.toISOString()).toBe('2026-11-06T04:00:00.000Z');
  });
  it('fails closed on stale, missing, duplicated or malformed BCV evidence', () => {
    for (const source of [
      html('894,12', '2026-11-04'),
      html() + html(),
      html().replace('Fecha Valor', 'Otra fecha'),
      html('0,00'),
      html().replace('id="dolar"', 'id="usd"'),
    ])
      expect(() => parseBcvSource(source, at)).toThrow();
  });
  it('keeps a tomorrow value date future rather than making it usable today', () => {
    expect(parseBcvSource(html('900,10', '2026-11-06'), at).validFrom > at).toBe(true);
  });
  it('reads the BUY endpoint decimal lexically and bounds the quote to ten minutes', () => {
    const raw =
      '{"success":true,"code":"000000","data":{"asset":"USDT","fiat":"VES","price":1010.12345678}}';
    const result = parseUsdtSource(raw, at);
    expect(result.rate).toBe('1010.12345678');
    expect(result.validUntil.getTime() - at.getTime()).toBe(600000);
    for (const broken of [
      raw.replace('VES', 'USD'),
      raw.replace('true', 'false'),
      raw.replace('1010.12345678', '-1'),
      raw.replace('1010.12345678', '1e3'),
      raw.replace('"fiat"', '"price":20,"fiat"'),
    ])
      expect(() => parseUsdtSource(broken, at)).toThrow();
  });
  it('accepts only the pinned purchase source and a valid short-lived historical ID', () => {
    const source = parseUsdtSource(
      '{"success":true,"code":"000000","data":{"asset":"USDT","fiat":"VES","price":1010}}',
      at,
    );
    const row: OfficialRateCacheRow = {
      id: '00000000-0000-4000-8000-000000000013',
      rate: source.rate,
      source: source.source,
      source_url: source.sourceUrl,
      source_hash: 'a'.repeat(64),
      valid_from: source.validFrom,
      valid_until: source.validUntil,
      fetched_at: at,
      verified_at: at,
      verified_by: 'test-only',
    };
    expect(selectUsdtRate([row], at)?.rate).toBe('1010.00000000');
    expect(selectUsdtRate([row], source.validUntil)).toBeNull();
    expect(
      selectUsdtRate([{ ...row, source_url: row.source_url.replace('BUY', 'SELL') }], at),
    ).toBeNull();
    expect(
      selectUsdtRate([{ ...row, valid_until: new Date(at.getTime() + 86400000) }], at),
    ).toBeNull();
  });
  it.each([
    '{"success":true,"code":"000000","data":{"asset":"USDT","fiat":"VES"},"other":{"price":1010}}',
    '{"success":true,"code":"000000","data":{"asset":"USDT","fiat":"VES","other":{"price":1010}}}',
    '{"success":true,"code":"000000","data":{"asset":"USDT","fiat":"VES","pr\\u0069ce":999,"price":1010}}',
    '{"success":true,"code":"000000","data":{},"data":{"asset":"USDT","fiat":"VES","price":1010}}',
  ])('rejects a quote outside data.price or an ambiguous JSON key: %s', (raw) => {
    expect(() => parseUsdtSource(raw, at)).toThrow();
  });
  it.each(['123456789012.12345678', '"123456789012.12345678"'])(
    'preserves all decimal digits in the data.price token %s',
    (price) => {
      const raw = `{"success":true,"code":"000000","data":{"asset":"USDT","fiat":"VES","price":${price}}}`;
      expect(parseUsdtSource(raw, at).rate).toBe('123456789012.12345678');
    },
  );
});
