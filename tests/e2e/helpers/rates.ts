import { randomUUID, createHash } from 'node:crypto';
import { Client } from 'pg';
import dotenv from 'dotenv';
import { BCV_SOURCE_URL, USDT_SOURCE_URL } from '../../../packages/domain/src/rate-sources';

dotenv.config({ quiet: true });
/** Synthetic immutable cache rows, confined to the project's disposable E2E database. */
export async function syntheticPaymentRates() {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.port !== '55432' ||
    url.username !== 'mm_owner'
  )
    throw new Error('Solo el PostgreSQL local de QA.');
  url.pathname = '/manzanas_maracay_test';
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    if (
      (await db.query('select environment from runtime_environment where singleton')).rows[0]
        ?.environment !== 'test'
    )
      throw new Error('La base debe estar vinculada a test.');
    const now = Date.now();
    const stamp = new Date(now - 1000).toISOString();
    const until = new Date(now + 9 * 60000).toISOString();
    const bcv = {
      id: randomUUID(),
      rate: '60.00000000',
      source: 'BCV',
      sourceUrl: BCV_SOURCE_URL,
      validFrom: stamp,
      validUntil: until,
      verifiedAt: stamp,
    };
    const usdt = {
      ...bcv,
      id: randomUUID(),
      rate: '50.00000000',
      source: 'BINANCE_P2P_BUY',
      sourceUrl: USDT_SOURCE_URL,
    };
    for (const [table, rate] of [
      ['bcv_rates', bcv],
      ['usdt_rates', usdt],
    ] as const) {
      await db.query(
        `insert into ${table}(id,rate,source,source_url,source_hash,valid_from,valid_until,fetched_at,verified_at,verified_by)
        values($1,$2,$3,$4,$5,$6,$7,$6,$6,'QA V4 SINTÉTICA LOCAL; NO COTIZACIÓN REAL')`,
        [
          rate.id,
          rate.rate,
          rate.source,
          rate.sourceUrl,
          createHash('sha256').update(rate.id).digest('hex'),
          stamp,
          until,
        ],
      );
    }
    return {
      bcv,
      usdt,
      status: { status: 'available', rate: bcv, usdt: { status: 'available', rate: usdt } },
    };
  } finally {
    await db.end();
  }
}
