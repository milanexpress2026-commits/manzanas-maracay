import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import type { OfficialRateProvider } from '../../../packages/domain/src/index';
import {
  readOfficialRate,
  selectOfficialRate,
  selectUsdtRate,
  type OfficialRateCacheRow,
} from './bcv-rate';

@Injectable()
export class BcvService implements OfficialRateProvider, OnModuleDestroy {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 3000,
  });

  constructor() {
    this.pool.on('error', () => console.warn('La caché de tasas oficiales no está disponible.'));
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  getCurrent(at: Date) {
    return readOfficialRate(async (instant) => {
      const result = await this.pool.query<OfficialRateCacheRow>(
        `select id,rate,source,source_url,source_hash,valid_from,valid_until,
                fetched_at,verified_at,verified_by
           from bcv_rates
          where valid_from <= $1 and valid_until > $1
          order by valid_from desc,id
          limit 2`,
        [instant],
      );
      return result.rows;
    }, at);
  }

  getVerifiedRate(at: Date) {
    return this.getCurrent(at);
  }

  async getById(id: string, at: Date) {
    try {
      return selectOfficialRate(
        (await this.pool.query<OfficialRateCacheRow>('select * from bcv_rates where id=$1', [id]))
          .rows,
        at,
      );
    } catch {
      return null;
    }
  }

  async getUsdtById(id: string, at: Date) {
    try {
      return selectUsdtRate(
        (await this.pool.query<OfficialRateCacheRow>('select * from usdt_rates where id=$1', [id]))
          .rows,
        at,
      );
    } catch {
      return null;
    }
  }

  async getCurrentUsdt(at: Date) {
    try {
      // Each quote is immutable. Multiple short-lived observations may overlap;
      // offer only the newest, while a previously reviewed valid ID stays usable.
      const rows = (
        await this.pool.query<OfficialRateCacheRow>(
          'select * from usdt_rates where valid_from <= $1 and valid_until > $1 order by verified_at desc,id limit 1',
          [at],
        )
      ).rows;
      return selectUsdtRate(rows, at);
    } catch {
      return null;
    }
  }

  async status(at = new Date()) {
    const rate = await this.getCurrent(at);
    const quote = await this.getCurrentUsdt(at);
    const usdt = quote
      ? { status: 'available' as const, rate: quote, verifiedAt: quote.verifiedAt.toISOString() }
      : {
          status: 'unavailable' as const,
          rate: null,
          message:
            'La cotización de compra USDT no está disponible. Puedes cobrar USD o USDT a 1:1.',
        };
    return {
      ...(rate
        ? { status: 'available' as const, rate, verifiedAt: rate.verifiedAt.toISOString() }
        : {
            status: 'unavailable' as const,
            rate: null,
            reason: 'no_verified_current_rate',
            message: 'No hay una tasa BCV vigente y verificada. Puedes registrar cobros en USD.',
            sourceUrl: 'https://www.bcv.org.ve/',
          }),
      usdt,
    };
  }
}
