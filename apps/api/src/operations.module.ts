import { Controller, Get, Injectable, Module, Inject, type OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import type { OperationsOverview } from '../../../packages/domain/src/operations';
import { authConfig } from './auth/config';
import { operationsReady } from './production-state';

@Injectable()
class OperationsService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
  });
  constructor() {
    this.pool.on('error', () => console.warn('El resumen operativo no está disponible.'));
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
  async overview(): Promise<OperationsOverview> {
    const { rows } = await this.pool.query(`select
      (select count(*)::int from suppliers where active) as suppliers,
      (select count(*)::int from fruits) as fruits,
      (select count(*)::int from packing_rules where confirmation_status='confirmed') as confirmed,
      (select count(*)::int from packing_rules where confirmation_status='pending') as pending,
      (select count(*)::int from purchases where status='received') as receipts,
      (select count(*)::int from (select variant_id,presentation from price_items i join price_lists l on l.id=i.price_list_id group by variant_id,presentation having count(distinct l.payment_basis)=2) p) as priced,
      (select count(*)::int from clients where active) as clients,
      (select count(*)::int from sales s where status='confirmed' and not exists(select 1 from sale_cancellations c where c.sale_id=s.id)) as sales,
      (select coalesce(sum(quantity),0)::int from stock_balances where unit='sealed_box') as boxes,
      (select coalesce(sum(balance_usd),0)::numeric(18,2)::text from receivables) as debt`);
    const row = rows[0];
    return {
      environment: authConfig().environment,
      ready: operationsReady(),
      counts: {
        suppliers: row.suppliers,
        fruits: row.fruits,
        confirmedConfigurations: row.confirmed,
        pendingConfigurations: row.pending,
        receipts: row.receipts,
        pricedPresentations: row.priced,
        clients: row.clients,
        sales: row.sales,
      },
      inventory: { sealedBoxes: row.boxes },
      receivablesUsd: row.debt,
    };
  }
}
@Controller('api/operations')
class OperationsController {
  constructor(@Inject(OperationsService) private readonly service: OperationsService) {}
  @Get('overview') overview() {
    return this.service.overview();
  }
}
@Module({ providers: [OperationsService], controllers: [OperationsController] })
export class OperationsModule {}
