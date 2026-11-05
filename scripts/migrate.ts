import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import path from 'node:path';
import { establishCostBaseline } from './inventory-cost-baseline';
import { appEnvironmentSchema } from '../packages/domain/src/auth';
import { databaseTarget } from '../packages/database/src/environment';
export function assertDatabase(value: string | undefined) {
  databaseTarget(value, {
    environment: appEnvironmentSchema.parse(process.env.MM_APP_ENV ?? 'local'),
    role: 'owner',
    nodeEnvironment: process.env.NODE_ENV,
    productionTestDatabase: process.env.MM_PRODUCTION_TEST_DATABASE,
  });
  return value!;
}
export async function migrateDatabase(url: string) {
  const target = databaseTarget(url, {
    environment: appEnvironmentSchema.parse(process.env.MM_APP_ENV ?? 'local'),
    role: 'owner',
    nodeEnvironment: process.env.NODE_ENV,
    productionTestDatabase: process.env.MM_PRODUCTION_TEST_DATABASE,
  });
  const pool = new Pool({ connectionString: assertDatabase(url), max: 1 });
  try {
    const client = await pool.connect();
    try {
      await client.query('select pg_advisory_lock(68493001)');
      await migrate(drizzle(client), {
        migrationsFolder: path.resolve('packages/database/migrations'),
      });
    } finally {
      await client.query('select pg_advisory_unlock(68493001)');
      client.release();
    }
    const role = target.applicationRole;
    const grants = `revoke all on schema public from public; grant usage on schema public to mm_app;
      grant select,insert on fruits,calibers,product_variants,command_receipts to mm_app;
      grant select,insert,update on varieties to mm_app;
      grant select,insert,update on packing_rules to mm_app;
      grant insert on audit_events to mm_app;
      grant select,insert,update on suppliers,lots,containers,stock_balances to mm_app;
      grant select on warehouses to mm_app;
      grant select,insert on purchases,purchase_lines,inventory_movements,inventory_entries to mm_app;
      grant select,insert on inventory_cost_entries to mm_app;
      grant select on inventory_cost_openings,bcv_rates to mm_app;
      grant usage,select on sequence inventory_cost_entries_entry_order_seq to mm_app;
      grant select,insert,update on clients,price_items to mm_app;
      grant select,insert on price_lists,sales,sale_lines,sale_allocations,sale_date_events,sale_cancellations,payments,payment_applications,payment_reversals to mm_app;
      grant select on receivables to mm_app;
      grant select,insert,update on push_devices,push_notices to mm_app;
      grant usage,select on sequence mm_sale_number_seq,mm_payment_number_seq,sale_date_events_event_order_seq to mm_app;
      grant usage,select on sequence inventory_entries_entry_order_seq to mm_app;
      revoke all on app_users,auth_sessions,auth_login_buckets from public;
      grant select on app_users to mm_app;
      grant select,insert,update,delete on auth_sessions,auth_login_buckets to mm_app;
      revoke all on runtime_environment from public;
      grant select on runtime_environment to mm_app;`;
    // Both names come from the fixed target allowlist; no environment/request identifier is interpolated.
    await pool.query(grants.replaceAll('mm_app', role));
    const { rows } = await pool.query('select * from runtime_environment where singleton');
    const binding = rows[0];
    if (
      rows.length !== 1 ||
      binding.database_name !== target.database ||
      binding.environment !== target.environment ||
      binding.owner_role !== target.ownerRole ||
      binding.application_role !== role ||
      binding.purpose !== target.purpose
    )
      throw new Error(
        'El vínculo inmutable de base y entorno no coincide. No se habilitó la aplicación.',
      );
    console.log('Migraciones aplicadas y permisos mínimos configurados.');
    await establishCostBaseline(pool);
  } finally {
    await pool.end();
  }
}
if (process.argv[1]?.endsWith('migrate.ts'))
  migrateDatabase(assertDatabase(process.env.MIGRATION_DATABASE_URL)).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
