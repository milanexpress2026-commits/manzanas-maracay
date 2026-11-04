import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import path from 'node:path';
export function assertDatabase(value: string | undefined) {
  if (!value) throw new Error('Falta MIGRATION_DATABASE_URL.');
  const url = new URL(value);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '55432' ||
    !['/manzanas_maracay_dev', '/manzanas_maracay_test'].includes(url.pathname)
  )
    throw new Error('Solo se permite migrar la base local exclusiva de Manzanas Maracay.');
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
      grant insert on audit_events to mm_app;`);
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
