/** Synthetic production-mode regression data belongs only to a uniquely marked loopback QA database. */
import 'reflect-metadata';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Client, Pool } from 'pg';
import { provisionUser } from '../apps/api/src/auth/provision';
import { migrateDatabase } from './migrate';

async function main() {
  const directory = path.resolve('.local/production-qa');
  const mode = process.argv[2];
  const name = process.env.MM_PRODUCTION_TEST_DATABASE ?? '';
  const runId = process.env.MM_QA_RUN_ID ?? '';
  const adminUrl = new URL(process.env.MM_QA_ADMIN_DATABASE_URL ?? 'invalid:');
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.MM_APP_ENV !== 'production' ||
    !/^[a-f0-9]{24}$/.test(runId) ||
    !/^manzanas_maracay_production_test_[a-f0-9]{12}$/.test(name) ||
    !['postgres:', 'postgresql:'].includes(adminUrl.protocol) ||
    adminUrl.hostname !== '127.0.0.1' ||
    adminUrl.port !== '55432' ||
    adminUrl.username !== 'mm_owner' ||
    adminUrl.pathname !== '/postgres'
  )
    throw new Error('El ensayo solo admite la base temporal y el servidor local propios.');
  const admin = new Client({ connectionString: adminUrl.toString(), statement_timeout: 30000 });
  const marker = `MM_PHASE4_PRODUCTION_QA:${runId}`;
  const stateFile = path.join(directory, 'current.json');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await admin.connect();
  try {
    if (mode === 'cleanup') {
      const row = (
        await admin.query(
          "select pg_get_userbyid(datdba) as owner,shobj_description(oid,'pg_database') as marker from pg_database where datname=$1",
          [name],
        )
      ).rows[0];
      if (!row) {
        console.log('La base temporal de esta ejecución ya no existe.');
      } else {
        if (row.owner !== 'mm_prod_owner' || row.marker !== marker)
          throw new Error('La base no coincide con la marca de este ensayo.');
        if ((await admin.query('select 1 from pg_stat_activity where datname=$1', [name])).rowCount)
          throw new Error('Quedan conexiones; no se fuerza el borrado temporal.');
        await admin.query(`drop database "${name}"`);
        console.log('Base temporal exclusiva retirada; no se tocaron otras bases.');
      }
    } else if (mode === 'setup') {
      if ((await admin.query('select 1 from pg_database where datname=$1', [name])).rowCount)
        throw new Error('El nombre de base temporal ya existe.');
      const rolesFile = path.join(directory, 'roles.json');
      let credentials: Record<string, string>;
      try {
        credentials = JSON.parse(await fs.readFile(rolesFile, 'utf8'));
      } catch (error: any) {
        if (error.code !== 'ENOENT') throw new Error('Archivo local de roles inválido.');
        credentials = {
          mm_prod_owner: randomBytes(32).toString('hex'),
          mm_prod_app: randomBytes(32).toString('hex'),
        };
        await fs.writeFile(rolesFile, JSON.stringify(credentials), { flag: 'wx', mode: 0o600 });
      }
      for (const role of ['mm_prod_owner', 'mm_prod_app'] as const) {
        const password = credentials[role];
        if (!/^[a-f0-9]{64}$/.test(password ?? ''))
          throw new Error('Secreto local de ensayo inválido.');
        const found = (
          await admin.query(
            "select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,exists(select 1 from pg_auth_members m where m.member=pg_roles.oid) as has_membership,shobj_description(oid,'pg_authid') as marker from pg_roles where rolname=$1",
            [role],
          )
        ).rows[0];
        if (found) {
          if (
            found.rolsuper ||
            found.rolcreatedb ||
            found.rolcreaterole ||
            found.rolreplication ||
            found.rolbypassrls ||
            found.has_membership ||
            found.marker !== 'MM_PHASE4_QA_ROLE'
          )
            throw new Error('El rol existente no pertenece a este ensayo.');
        } else {
          await admin.query(
            `create role ${role} login nosuperuser nocreatedb nocreaterole noreplication nobypassrls password '${password}'`,
          );
          await admin.query(`comment on role ${role} is 'MM_PHASE4_QA_ROLE'`);
        }
      }
      await admin.query(`create database "${name}" owner mm_prod_owner`);
      await admin.query(`comment on database "${name}" is '${marker}'`);
      await admin.query(`revoke connect on database "${name}" from public`);
      await admin.query(`grant connect on database "${name}" to mm_prod_app`);
      const urlFor = (role: string) => {
        const value = new URL(adminUrl);
        value.pathname = `/${name}`;
        value.username = role;
        value.password = credentials[role];
        return value.toString();
      };
      const ownerUrl = urlFor('mm_prod_owner'),
        applicationUrl = urlFor('mm_prod_app');
      // State is private and persisted before migration so failed setups can be cleaned narrowly.
      await fs.writeFile(
        stateFile,
        JSON.stringify({ runId, database: name, ownerUrl, applicationUrl, marker, created: true }),
        { mode: 0o600 },
      );
      process.env.MIGRATION_DATABASE_URL = ownerUrl;
      process.env.DATABASE_URL = applicationUrl;
      await migrateDatabase(ownerUrl);
      const pool = new Pool({ connectionString: ownerUrl, max: 1 });
      try {
        const tables = [
          'fruits',
          'varieties',
          'calibers',
          'product_variants',
          'packing_rules',
          'price_lists',
          'price_items',
          'suppliers',
          'clients',
          'purchases',
          'purchase_lines',
          'lots',
          'containers',
          'stock_balances',
          'sales',
          'sale_lines',
          'payments',
          'payment_applications',
          'app_users',
          'bcv_rates',
        ];
        for (const table of tables)
          if (
            Number(
              (await pool.query(`select count(*)::int as count from ${table}`)).rows[0].count,
            ) !== 0
          )
            throw new Error('Una base recién migrada contiene datos no autorizados.');
        const identity = (
          await pool.query(
            'select database_instance_id,environment,purpose from runtime_environment where singleton',
          )
        ).rows[0];
        if (identity?.environment !== 'production' || identity.purpose !== 'production_regression')
          throw new Error('Vínculo de QA de producción incorrecto.');
        const auth = {
          username: 'qa-propietarios',
          displayName: 'Propietarios de ensayo aislado',
          password: randomBytes(24).toString('base64url'),
        };
        await provisionUser(pool, auth);
        await fs.writeFile(path.join(directory, 'auth.json'), JSON.stringify(auth), {
          mode: 0o600,
        });
        await fs.writeFile(
          stateFile,
          JSON.stringify({
            runId,
            database: name,
            ownerUrl,
            applicationUrl,
            marker,
            created: true,
            databaseInstanceId: identity.database_instance_id,
            emptyBusinessTablesVerified: tables.length,
            productionOwnerSuperuser: false,
          }),
          { mode: 0o600 },
        );
        console.log(
          'Base QA de producción vacía verificada, roles sin superusuario y acceso sintético privado preparados.',
        );
      } finally {
        await pool.end();
      }
    } else throw new Error('Modo de ensayo no reconocido.');
  } finally {
    await admin.end();
  }
}
main().catch((error: unknown) => {
  console.error(
    'Falló el ensayo privado de producción.',
    error instanceof Error ? error.name : 'Error',
    typeof error === 'object' && error !== null && 'code' in error ? error.code : '',
  );
  process.exitCode = 1;
});
