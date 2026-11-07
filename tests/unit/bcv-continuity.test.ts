import { afterEach, describe, expect, it, vi } from 'vitest';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import type { Pool, PoolClient } from 'pg';
import {
  BCV_SOURCE_URL,
  BCV_CONTINUITY_PREFIX,
  parseBcvSource,
  planBcvContinuity,
  readBcvContinuityMetadata,
  validateBcvContinuity,
  type BcvObservation,
  type CollectedRate,
} from '../../packages/domain/src/rate-sources';
import { selectOfficialRate, selectLastOfficialRate } from '../../apps/api/src/bcv-rate';
import { collectRates, storeBcvObservation } from '../../scripts/refresh-rates';

const now = new Date('2026-11-07T13:00:00Z');
const original = (): BcvObservation => ({
  id: '50000000-0000-4000-8000-000000000001',
  source: 'BCV',
  source_url: BCV_SOURCE_URL,
  source_hash: 'a'.repeat(64),
  rate: '896.12250000',
  valid_from: new Date('2026-11-06T04:00:00Z'),
  valid_until: new Date('2026-11-07T04:00:00Z'),
  fetched_at: new Date('2026-11-05T22:00:00Z'),
  verified_at: new Date('2026-11-05T22:00:01Z'),
  verified_by: 'automatic-strict-tls-v1',
});
const next = (date = '2026-11-09'): BcvObservation => ({
  ...original(),
  id: '50000000-0000-4000-8000-000000000002',
  source_hash: 'b'.repeat(64),
  rate: '897.53830000',
  valid_from: new Date(`${date}T04:00:00Z`),
  valid_until: new Date(new Date(`${date}T04:00:00Z`).getTime() + 86400000),
  fetched_at: new Date('2026-11-06T22:00:00Z'),
  verified_at: new Date('2026-11-06T22:00:01Z'),
});
const fresh = (row = next()): CollectedRate => ({
  rate: row.rate,
  source: 'BCV',
  sourceUrl: BCV_SOURCE_URL,
  validFrom: row.valid_from,
  validUntil: row.valid_until,
});
const derived = (): BcvObservation => ({
  ...planBcvContinuity(original(), next(), fresh(), now, now)!,
  id: '50000000-0000-4000-8000-000000000003',
});
const db = (...responses: BcvObservation[][]) => {
  const query = vi.fn();
  for (const rows of responses) query.mockResolvedValueOnce({ rows });
  return { query, client: { query } as unknown as Pick<PoolClient, 'query'> };
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('continuidad BCV acotada a próxima fecha oficial conocida', () => {
  it('cubre viernes→lunes con la evidencia original intacta y verificación actual', () => {
    const row = derived();
    expect(row).toMatchObject({
      rate: original().rate,
      source_hash: original().source_hash,
      source_url: original().source_url,
      fetched_at: original().fetched_at,
      verified_at: now,
      valid_from: original().valid_until,
      valid_until: next().valid_from,
    });
    expect(readBcvContinuityMetadata(row.verified_by)).toEqual({
      policy: 'last_official_until_next_value_date_v1',
      originalValueDate: '2026-11-06',
      parentId: original().id,
      nextId: next().id,
    });
    expect(validateBcvContinuity(row, [original(), next()])).toBe('2026-11-06');
    const selected = selectOfficialRate([row], now, [original(), next()]);
    expect(selected?.officialValueDate).toBe('2026-11-06');
    expect(selected?.validFrom).toEqual(new Date('2026-11-07T04:00:00Z'));
    expect(selectOfficialRate([row], now)).toBeNull();
    expect(
      selectOfficialRate([row], new Date('2026-11-07T12:59:59Z'), [original(), next()]),
    ).toBeNull();
    expect(selectOfficialRate([row], next().valid_from, [original(), next()])).toBeNull();
    expect(
      selectLastOfficialRate([row], next().valid_from, [original(), next()])?.officialValueDate,
    ).toBe('2026-11-06');
  });

  it('permite martes únicamente cuando esa fecha se verificó y no supera cuatro días desde viernes', () => {
    const tuesday = next('2026-11-10');
    expect(planBcvContinuity(original(), tuesday, fresh(tuesday), now, now)?.valid_until).toEqual(
      tuesday.valid_from,
    );
    const wednesday = next('2026-11-11');
    expect(() => planBcvContinuity(original(), wednesday, fresh(wednesday), now, now)).toThrow();
    expect(() => planBcvContinuity(original(), tuesday, fresh(), now, now)).toThrow();
  });

  it.each([
    { source_url: 'https://bcv.org.ve.evil.example/' },
    { source_hash: 'bad' },
    { rate: '0.00000000' },
    { verified_by: 'unknown-import' },
    { fetched_at: new Date('2026-11-08T00:00:00Z') },
    { valid_from: new Date('2026-11-06T05:00:00Z') },
  ])('rechaza un padre no verificable %#', (change) => {
    expect(() =>
      planBcvContinuity({ ...original(), ...change }, next(), fresh(), now, now),
    ).toThrow();
  });

  it('no encadena derivados ni continúa sin respuesta fresca o próxima fecha futura', () => {
    expect(() =>
      planBcvContinuity(
        derived(),
        next('2026-11-10'),
        fresh(next('2026-11-10')),
        new Date('2026-11-09T12:00:00Z'),
        new Date('2026-11-09T12:00:00Z'),
      ),
    ).toThrow();
    expect(() =>
      planBcvContinuity(original(), next(), fresh(), new Date(now.getTime() - 300001), now),
    ).toThrow();
    expect(() =>
      planBcvContinuity(original(), next(), fresh(), new Date(now.getTime() + 1), now),
    ).toThrow();
    expect(() =>
      planBcvContinuity(original(), next('2026-11-07'), fresh(next('2026-11-07')), now, now),
    ).toThrow();
    expect(() => parseBcvSource('<div id="dolar"><strong>896,1225</strong></div>', now)).toThrow();
  });

  it('valida metadatos, enlaces y fecha original en el lector, sin aceptar otra fuente o cambiar el padre', () => {
    const row = derived();
    const metadata = readBcvContinuityMetadata(row.verified_by)!;
    for (const changed of [
      { ...metadata, originalValueDate: '2026-11-07' },
      { ...metadata, originalValueDate: '2026-02-30' },
      { ...metadata, extra: 'unexpected' },
      { ...metadata, parentId: next().id },
    ])
      expect(
        selectOfficialRate(
          [{ ...row, verified_by: BCV_CONTINUITY_PREFIX + JSON.stringify(changed) }],
          now,
          [original(), next()],
        ),
      ).toBeNull();
    expect(
      readBcvContinuityMetadata(row.verified_by.replace('{', '{"policy":"other",')),
    ).toBeNull();
    expect(
      selectOfficialRate([{ ...row, source_hash: 'c'.repeat(64) }], now, [original(), next()]),
    ).toBeNull();
    expect(
      selectOfficialRate([row], now, [
        original(),
        { ...next(), valid_from: next('2026-11-10').valid_from },
      ]),
    ).toBeNull();
    expect(
      selectOfficialRate([row], now, [{ ...original(), rate: '1.00000000' }, next()]),
    ).toBeNull();
  });

  it.each([
    'bcv-continuity-v1',
    'bcv-continuity-v2:{}',
    'bcv-continuity',
    ' BCV-CONTINUITY-v1:bad',
    'bcv-continuity-v1:',
  ])('la familia reservada malformada no omite los padres: %s', (verified_by) => {
    const row = { ...derived(), verified_by };
    expect(selectOfficialRate([row], now)).toBeNull();
    expect(selectOfficialRate([row], now, [original(), next()])).toBeNull();
    expect(selectLastOfficialRate([row], next().valid_from, [original(), next()])).toBeNull();
  });

  it('bootstrap actual o día hábil vigente no generan otra observación', async () => {
    const bootstrap = {
      ...original(),
      valid_until: next().valid_from,
      verified_by: 'policy_explicit_user_last_official_until_next_value_date_v1',
    };
    const cached = db([next()], [bootstrap]);
    expect(
      await storeBcvObservation(cached.client, fresh(), 'b'.repeat(64), now, now),
    ).toMatchObject({ continuityInserted: false });
    expect(cached.query.mock.calls.some((call) => /insert/i.test(call[0]))).toBe(false);
    const current = db([original()]);
    const friday = new Date('2026-11-06T13:00:00Z');
    expect(
      await storeBcvObservation(current.client, fresh(original()), 'a'.repeat(64), friday, friday),
    ).toMatchObject({ continuityInserted: false });
    expect(current.query.mock.calls).toHaveLength(1);
  });

  it('inserta solo el hueco y el reintento conserva identidad, fecha original y cantidad de filas', async () => {
    const initial = db([next()], [original()], [], []);
    expect(
      await storeBcvObservation(initial.client, fresh(), 'b'.repeat(64), now, now),
    ).toMatchObject({ continuityInserted: true });
    const inserts = initial.query.mock.calls.filter((call) => /insert/i.test(call[0]));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]![1]).toEqual([
      original().rate,
      'BCV',
      original().source_url,
      original().source_hash,
      original().valid_until,
      next().valid_from,
      original().fetched_at,
      now,
      derived().verified_by,
    ]);
    expect(
      initial.query.mock.calls.some((call) => /\b(update|delete|alter)\b/i.test(call[0])),
    ).toBe(false);
    const replay = db([next()], [derived()], [original(), next()]);
    expect(
      await storeBcvObservation(replay.client, fresh(), 'b'.repeat(64), now, now),
    ).toMatchObject({ continuityInserted: false });
    expect(replay.query.mock.calls.some((call) => /insert/i.test(call[0]))).toBe(false);
  });

  it('rechaza corrección, padres ambiguos o intervalo parcialmente ocupado', async () => {
    for (const responses of [
      [[next(), { ...next(), rate: '899.00000000' }]],
      [[{ ...next(), rate: '899.00000000' }]],
      [[next()], [original(), { ...original(), source_hash: 'c'.repeat(64) }]],
      [[next()], [original()], [{ ...derived(), valid_from: new Date('2026-11-08T04:00:00Z') }]],
    ]) {
      const mocked = db(...responses);
      await expect(
        storeBcvObservation(mocked.client, fresh(), 'b'.repeat(64), now, now),
      ).rejects.toThrow();
      expect(mocked.query.mock.calls.some((call) => /insert/i.test(call[0]))).toBe(false);
    }
  });

  it('una fuente offline no abre transacción ni amplía la última tasa', async () => {
    vi.spyOn(https, 'get').mockImplementation(() => {
      throw new Error('synthetic offline');
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ environment: 'production', database_name: 'manzanas_maracay_production' }],
      })
      .mockResolvedValueOnce({
        rows: [{ role: 'mm_prod_rates', db: 'manzanas_maracay_production' }],
      });
    const connect = vi.fn();
    const result = await collectRates({ query, connect } as unknown as Pool, 'production');
    expect(result.BCV).toMatchObject({ status: 'unavailable' });
    expect(connect).not.toHaveBeenCalled();
    expect(query.mock.calls.every((call) => /^select/.test(call[0]))).toBe(true);
  });

  it.each([false, true])(
    'el colector conserva lock, commit/rollback y liberación ante conflicto=%s',
    async (conflict) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
      vi.spyOn(https, 'get').mockImplementation((...args: unknown[]) => {
        const callback = args[2] as (response: IncomingMessage) => void;
        const response = Object.assign(new EventEmitter(), {
          statusCode: 200,
          headers: { date: now.toUTCString() },
          resume: vi.fn(),
          destroy: vi.fn(),
        });
        const body =
          args[0] === BCV_SOURCE_URL
            ? '<div id="dolar"><strong>897,53830000</strong>Fecha Valor: <span content="2026-11-09T00:00:00-04:00"></span></div>'
            : '{}';
        queueMicrotask(() => {
          callback(response as unknown as IncomingMessage);
          response.emit('data', Buffer.from(body));
          response.emit('end');
        });
        return Object.assign(new EventEmitter(), { destroy: vi.fn() }) as unknown as ClientRequest;
      });
      const query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ environment: 'production', database_name: 'manzanas_maracay_production' }],
        })
        .mockResolvedValueOnce({
          rows: [{ role: 'mm_prod_rates', db: 'manzanas_maracay_production' }],
        });
      const calls: string[] = [];
      const transactionalQuery = vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes('where valid_from=$1')) return { rows: [next()] };
        if (sql.includes('max(valid_from)')) return { rows: [original()] };
        if (sql.includes('source_hash=$3')) return { rows: conflict ? [derived()] : [] };
        return { rows: [] };
      });
      const release = vi.fn();
      const connect = vi.fn().mockResolvedValue({ query: transactionalQuery, release });
      const result = await collectRates({ query, connect } as unknown as Pool, 'production');
      expect(calls.slice(0, 3)).toEqual([
        'begin',
        "set local statement_timeout='5s'",
        'select pg_advisory_xact_lock(68493019)',
      ]);
      expect(calls.at(-1)).toBe(conflict ? 'rollback' : 'commit');
      expect(calls.filter((sql) => /^insert/.test(sql))).toHaveLength(conflict ? 0 : 1);
      expect(result.BCV).toMatchObject(
        conflict ? { status: 'unavailable' } : { continuityInserted: true },
      );
      expect(release).toHaveBeenCalledOnce();
      expect(connect).toHaveBeenCalledOnce(); // Invalid USDT source never opens a second transaction.
    },
  );

  it('sin observación anterior no infiere una tasa ni un calendario', async () => {
    const mocked = db([next()], []);
    expect(
      await storeBcvObservation(mocked.client, fresh(), 'b'.repeat(64), now, now),
    ).toMatchObject({ continuityInserted: false });
    expect(mocked.query.mock.calls.some((call) => /insert/i.test(call[0]))).toBe(false);
  });
});
