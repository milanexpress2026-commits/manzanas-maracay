import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { databaseTarget, type DatabaseTarget } from '../../../packages/database/src/environment';
import {
  operationIsDemo,
  validateProductionActivation,
  type ProductionIdentity,
} from '../../../packages/domain/src/production';
import { authConfig } from './auth/config';

type Binding = DatabaseTarget & { databaseInstanceId: string };
let binding: Binding | undefined;

/** Run before Nest starts listening; no request may select the database or environment. */
export async function initializeRuntimeEnvironment() {
  const config = authConfig();
  const target = databaseTarget(process.env.DATABASE_URL, {
    environment: config.environment,
    role: 'application',
    nodeEnvironment: process.env.NODE_ENV,
    productionTestDatabase: process.env.MM_PRODUCTION_TEST_DATABASE,
  });
  if (
    config.environment === 'production' &&
    (!/^[a-f0-9]{40}$/.test(process.env.MM_COMMIT ?? '') ||
      !/^[a-zA-Z0-9._-]{1,100}$/.test(process.env.MM_RELEASE ?? ''))
  )
    throw new Error('Producción requiere commit y release exactos.');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 3000,
    statement_timeout: 5000,
  });
  try {
    const { rows } =
      await pool.query(`select e.*, current_database() as connected_database, current_user as connected_role,
      r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls,
      pg_has_role(current_user,e.owner_role,'member') as owner_member
      from runtime_environment e join pg_roles r on r.rolname=current_user where e.singleton`);
    const row = rows[0];
    if (
      rows.length !== 1 ||
      row.environment !== target.environment ||
      row.database_name !== target.database ||
      row.connected_database !== target.database ||
      row.application_role !== target.applicationRole ||
      row.connected_role !== target.applicationRole ||
      row.owner_role !== target.ownerRole ||
      row.purpose !== target.purpose ||
      row.rolsuper ||
      row.rolcreatedb ||
      row.rolcreaterole ||
      row.rolbypassrls ||
      row.owner_member
    )
      throw new Error(
        'El vínculo persistente de la base no corresponde al entorno o sus privilegios.',
      );
    binding = { ...target, databaseInstanceId: row.database_instance_id as string };
  } finally {
    await pool.end();
  }
}

export function productionIdentity(): ProductionIdentity | null {
  if (!binding || binding.environment !== 'production') return null;
  return {
    release: process.env.MM_RELEASE ?? '',
    commit: process.env.MM_COMMIT ?? '',
    database: binding.database,
    databaseInstanceId: binding.databaseInstanceId,
    origin: authConfig().origin,
  };
}

export function operationsReady(): boolean {
  if (authConfig().environment !== 'production') return true;
  const expected = productionIdentity();
  const file = process.env.MM_PRODUCTION_GATE_FILE;
  if (!expected || !file || !path.isAbsolute(file)) return false;
  try {
    const stat = lstatSync(file);
    if (
      !stat.isFile() ||
      stat.size < 2 ||
      stat.size > 16384 ||
      (process.platform !== 'win32' && (stat.mode & 0o022) !== 0)
    )
      return false;
    return validateProductionActivation(JSON.parse(readFileSync(file, 'utf8')), expected);
  } catch {
    return false;
  }
}

export function assertBusinessWritesReady() {
  if (!operationsReady())
    throw new ServiceUnavailableException(
      'La operación real sigue en preparación. Puedes consultar, pero todavía no registrar movimientos.',
    );
}

export function commandIsDemo(requested = false) {
  try {
    return operationIsDemo(authConfig().environment, requested);
  } catch {
    throw new BadRequestException('Producción no admite registros DEMO.');
  }
}
