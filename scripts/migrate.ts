import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import path from 'node:path';
export function assertDatabase(value: string | undefined) {
  if (!value) throw new Error('Falta MIGRATION_DATABASE_URL.');
  const url = new URL(value);
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '55432' &&
    ['/manzanas_maracay_dev', '/manzanas_maracay_test'].includes(url.pathname);
  const staging = process.env.MM_APP_ENV === 'staging' && url.hostname === 'postgres' &&
    url.port === '5432' && url.pathname === '/manzanas_maracay_staging';
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.username !== 'mm_owner' || (!local && !staging))
    throw new Error('Solo se permiten las bases exclusivas de Manzanas Maracay: local o staging aislado.');
  return value;
}
export async function migrateDatabase(url: string) {
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
    await pool.query(`revoke all on schema public from public; grant usage on schema public to mm_app;
      grant select,insert on fruits,varieties,calibers,product_variants,command_receipts to mm_app;
      grant select,insert,update on packing_rules to mm_app;
      grant insert on audit_events to mm_app;
      grant select,insert,update on suppliers,lots,containers,stock_balances to mm_app;
      grant select on warehouses to mm_app;
      grant select,insert on purchases,purchase_lines,inventory_movements,inventory_entries to mm_app;
      grant usage,select on sequence inventory_entries_entry_order_seq to mm_app;
      revoke all on app_users,auth_sessions,auth_login_buckets from public;
      grant select on app_users to mm_app;
      grant select,insert,update,delete on auth_sessions,auth_login_buckets to mm_app;`);
    console.log('Migraciones aplicadas y permisos mínimos configurados.');
  } finally {
    await pool.end();
  }
}
if (process.argv[1]?.endsWith('migrate.ts'))
  migrateDatabase(assertDatabase(process.env.MIGRATION_DATABASE_URL)).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
