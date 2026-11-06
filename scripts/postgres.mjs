import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { Client } from 'pg';
import { root, loadLocalEnv } from './local-env.mjs';
import { stopOwnedDatabase } from './stop-db.mjs';
import { assertLegacyDatabaseStopped, resolveDatabaseDirectory } from './e2e-database.mjs';
loadLocalEnv();
export async function startPostgres() {
  const databaseDir = resolveDatabaseDirectory(root);
  if (process.env.MM_E2E_PG_RUN_ID !== undefined) assertLegacyDatabaseStopped(root);
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', () =>
      reject(
        new Error('El puerto 55432 ya está ocupado. No se detuvo ni modificó ningún proceso.'),
      ),
    );
    probe.listen(55432, '127.0.0.1', () => probe.close(resolve));
  });
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'mm_owner',
    password: process.env.MM_PG_PASSWORD,
    port: 55432,
    persistent: true,
    authMethod: 'scram-sha-256',
    createPostgresUser: false,
    autoRehydrateSymlinks: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1', '-c', 'max_connections=30', '-c', 'shared_buffers=64MB'],
    onLog: () => {},
    onError: () => {},
  });
  if (!fs.existsSync(path.join(databaseDir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  // Use PostgreSQL's own graceful shutdown instead of the package's Windows taskkill fallback.
  pg.stop = stopOwnedDatabase;
  const client = new Client({
    host: '127.0.0.1',
    port: 55432,
    user: 'mm_owner',
    password: process.env.MM_PG_PASSWORD,
    database: 'postgres',
  });
  try {
    await client.connect();
    if (!(await client.query("select 1 from pg_roles where rolname='mm_app'")).rowCount) {
      const password = process.env.MM_APP_PASSWORD;
      if (!password || !/^[a-f0-9]{48}$/.test(password))
        throw new Error('La clave local debe haber sido generada por el iniciador.');
      await client.query(
        `create role mm_app login nosuperuser nocreatedb nocreaterole password '${password}'`,
      );
    }
    for (const name of ['manzanas_maracay_dev', 'manzanas_maracay_test']) {
      if (!(await client.query('select 1 from pg_database where datname=$1', [name])).rowCount)
        await client.query(`create database ${name} owner mm_owner`);
      await client.query(`revoke connect on database ${name} from public`);
      await client.query(`grant connect on database ${name} to mm_app`);
    }
    console.log('PostgreSQL local listo en 127.0.0.1:55432.');
    return pg;
  } catch (error) {
    await pg.stop();
    throw error;
  } finally {
    await client.end();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.join(root, 'scripts', 'postgres.mjs')
) {
  const pg = await startPostgres();
  const timer = setInterval(() => {}, 60000);
  const stop = async () => {
    clearInterval(timer);
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
