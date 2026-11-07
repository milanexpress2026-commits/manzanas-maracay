/** Isolated collector: no web endpoint, no owner/application credentials, no trading API. */
import fs from 'node:fs';
import https from 'node:https';
import tls from 'node:tls';
import path from 'node:path';
import { createHash, X509Certificate } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import {
  BCV_SOURCE_URL,
  USDT_SOURCE_URL,
  parseBcvSource,
  parseUsdtSource,
  planBcvContinuity,
  isOriginalBcvObservation,
  readBcvContinuityMetadata,
  validateBcvContinuity,
  type BcvObservation,
  type CollectedRate,
} from '../packages/domain/src/rate-sources';

const INTERMEDIATE_SHA = '8c54c334b66ba4e426772af4a3f9136c19a1aec729fdb28c535c07a5a4ef22e0';
const intermediate = fs.readFileSync(
  path.join(__dirname, 'certs/sectigo-public-server-dv-r36.pem'),
  'utf8',
);
if (
  new X509Certificate(intermediate).fingerprint256.replaceAll(':', '').toLowerCase() !==
  INTERMEDIATE_SHA
)
  throw new Error('Certificado público intermedio inesperado.');

export function fetchRateSource(url: string): Promise<string> {
  if (![BCV_SOURCE_URL, USDT_SOURCE_URL].includes(url)) throw new Error('Fuente no autorizada.');
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        // Supplement the missing intermediate only for BCV; retain standard roots,
        // hostname verification, expiry checks and rejectUnauthorized=true.
        ...(url === BCV_SOURCE_URL
          ? { ca: [...tls.getCACertificates('default'), intermediate] }
          : {}),
        headers: {
          'User-Agent': 'ManzanasMaracay/1.0 (public rates collector)',
          Accept: url === BCV_SOURCE_URL ? 'text/html' : 'application/json',
          'Cache-Control': 'no-cache',
        },
        timeout: 15000,
      },
      (response) => {
        const received = Date.now();
        const headerDate = Date.parse(response.headers.date ?? '');
        const age = Number(response.headers.age ?? 0);
        if (
          response.statusCode !== 200 ||
          !Number.isFinite(headerDate) ||
          Math.abs(received - headerDate) > 5 * 60 * 1000 ||
          !Number.isFinite(age) ||
          age < 0 ||
          age > 300
        ) {
          response.resume();
          reject(new Error('La fuente no devolvió una respuesta reciente verificable.'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 1500000) {
            response.destroy(new Error('Respuesta demasiado grande.'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      },
    );
    req.on('timeout', () => req.destroy(new Error('La fuente no respondió a tiempo.')));
    req.on('error', reject);
  });
}

/** Caller holds transaction advisory lock 68493019 and has just verified the live TLS source. */
export async function storeBcvObservation(
  client: Pick<PoolClient, 'query'>,
  rate: CollectedRate,
  hash: string,
  fetchedAt: Date,
  verifiedAt: Date,
) {
  if (rate.source !== 'BCV' || rate.sourceUrl !== BCV_SOURCE_URL || !/^[a-f0-9]{64}$/.test(hash))
    throw new Error('Observación BCV inesperada.');
  const existing = (
    await client.query<BcvObservation>(
      `select * from bcv_rates where valid_from=$1 or (valid_from<$2 and valid_until>$1)
     order by valid_from,id limit 2`,
      [rate.validFrom, rate.validUntil],
    )
  ).rows;
  let next: BcvObservation;
  if (existing.length) {
    if (
      existing.length !== 1 ||
      !isOriginalBcvObservation(existing[0]!, verifiedAt) ||
      existing[0]!.rate !== rate.rate ||
      existing[0]!.valid_from.getTime() !== rate.validFrom.getTime() ||
      existing[0]!.valid_until.getTime() !== rate.validUntil.getTime()
    )
      throw new Error('Hay una corrección o ambigüedad en BCV; requiere revisar la evidencia.');
    next = existing[0]!;
  } else {
    next = (
      await client.query<BcvObservation>(
        `insert into bcv_rates(rate,source,source_url,source_hash,valid_from,valid_until,fetched_at,verified_at,verified_by)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,
        [
          rate.rate,
          'BCV',
          rate.sourceUrl,
          hash,
          rate.validFrom,
          rate.validUntil,
          fetchedAt,
          verifiedAt,
          'automatic-strict-tls-v1',
        ],
      )
    ).rows[0]!;
  }
  const result = {
    status: existing.length ? 'unchanged' : 'verified',
    rate: rate.rate,
    validFrom: rate.validFrom,
    validUntil: rate.validUntil,
    sourceHash: next.source_hash,
    continuityInserted: false,
  };
  if (rate.validFrom <= verifiedAt) return result;
  const previousRows = (
    await client.query<BcvObservation>(
      `select * from bcv_rates
     where valid_from=(select max(valid_from) from bcv_rates where valid_from <= $1)
        or (valid_from <= $1 and valid_until > $1)
     order by valid_from desc,id limit 3`,
      [verifiedAt],
    )
  ).rows;
  if (!previousRows.length) return result; // A fresh future quote cannot invent a cold-start past value.
  if (previousRows.length !== 1) throw new Error('La última tasa oficial es ambigua.');
  const previous = previousRows[0]!;
  if (previous.valid_until > verifiedAt) {
    const metadata = readBcvContinuityMetadata(previous.verified_by);
    const parents = metadata
      ? (
          await client.query<BcvObservation>(
            'select * from bcv_rates where id=any($1::uuid[]) order by id limit 3',
            [[metadata.parentId, metadata.nextId]],
          )
        ).rows
      : [];
    if (
      !(metadata
        ? validateBcvContinuity(previous, parents)
        : isOriginalBcvObservation(previous, verifiedAt))
    )
      throw new Error('La observación actual no conserva evidencia oficial válida.');
    return result; // Includes the manually verified 6→9 bootstrap; never duplicate an active interval.
  }
  const continuation = planBcvContinuity(previous, next, rate, fetchedAt, verifiedAt);
  if (!continuation) return result;
  const overlaps = (
    await client.query<BcvObservation>(
      `select * from bcv_rates where (valid_from<$2 and valid_until>$1)
       or (source_hash=$3 and valid_from=$1) order by valid_from,id limit 2`,
      [continuation.valid_from, continuation.valid_until, continuation.source_hash],
    )
  ).rows;
  if (overlaps.length) throw new Error('La continuidad BCV se solapa con otra observación.');
  await client.query(
    `insert into bcv_rates(rate,source,source_url,source_hash,valid_from,valid_until,fetched_at,verified_at,verified_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      continuation.rate,
      continuation.source,
      continuation.source_url,
      continuation.source_hash,
      continuation.valid_from,
      continuation.valid_until,
      continuation.fetched_at,
      continuation.verified_at,
      continuation.verified_by,
    ],
  );
  return { ...result, continuityInserted: true };
}

export async function collectRates(pool: Pool, environment: 'staging' | 'production') {
  const binding = (
    await pool.query(
      'select environment,database_name,application_role from runtime_environment where singleton',
    )
  ).rows[0];
  const role = (await pool.query('select current_user as role,current_database() as db')).rows[0];
  const expected = environment === 'production' ? 'mm_prod_rates' : 'mm_rates';
  if (
    binding?.environment !== environment ||
    binding.database_name !== `manzanas_maracay_${environment}` ||
    role.db !== binding.database_name ||
    role.role !== expected
  )
    throw new Error('El recolector no está conectado a su base y rol exclusivos.');
  const results: Record<string, unknown> = {};
  // No network call holds a database transaction or business lock.
  for (const [name, url, parse] of [
    ['BCV', BCV_SOURCE_URL, parseBcvSource],
    ['USDT', USDT_SOURCE_URL, parseUsdtSource],
  ] as const) {
    try {
      const raw = await fetchRateSource(url);
      const fetchedAt = new Date();
      const rate: CollectedRate = parse(raw, fetchedAt);
      const verifiedAt = new Date();
      const hash = createHash('sha256').update(raw).digest('hex');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query("set local statement_timeout='5s'");
        await client.query('select pg_advisory_xact_lock(68493019)');
        if (name === 'BCV') {
          const result = await storeBcvObservation(client, rate, hash, fetchedAt, verifiedAt);
          await client.query('commit');
          results[name] = result;
          continue;
        }
        await client.query(
          `insert into usdt_rates(rate,source,source_url,source_hash,valid_from,valid_until,fetched_at,verified_at,verified_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            rate.rate,
            rate.source,
            url,
            hash,
            rate.validFrom,
            rate.validUntil,
            fetchedAt,
            verifiedAt,
            'automatic-strict-tls-v1',
          ],
        );
        await client.query('commit');
        results[name] = {
          status: 'verified',
          rate: rate.rate,
          validFrom: rate.validFrom,
          validUntil: rate.validUntil,
          sourceHash: hash,
        };
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      results[name] = {
        status: 'unavailable',
        reason: error instanceof Error ? error.message : 'Fallo de verificación',
      };
    }
  }
  return results;
}

async function main() {
  const environment = process.env.MM_APP_ENV;
  if (environment !== 'staging' && environment !== 'production')
    throw new Error('Recolector solo para un entorno explícito.');
  if (process.env.DATABASE_URL || process.env.MIGRATION_DATABASE_URL)
    throw new Error('No admite credenciales del propietario ni de la aplicación.');
  const file = process.env.MM_RATES_PASSWORD_FILE;
  if (file !== '/run/secrets/rates_password')
    throw new Error('Falta el secreto exclusivo del recolector.');
  const password = fs.readFileSync(file, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(password)) throw new Error('Secreto del recolector inválido.');
  const username = environment === 'production' ? 'mm_prod_rates' : 'mm_rates';
  const pool = new Pool({
    connectionString: `postgresql://${username}:${password}@postgres:5432/manzanas_maracay_${environment}`,
    max: 1,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  try {
    const result = await collectRates(pool, environment);
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result }));
    if (Object.values(result).some((x) => (x as { status: string }).status === 'unavailable'))
      process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
if (process.argv[1]?.endsWith('refresh-rates.ts'))
  void main().catch(() => {
    console.error('No se pudo iniciar el recolector de tasas.');
    process.exitCode = 1;
  });
