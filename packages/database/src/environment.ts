import type { AppEnvironment } from '../../domain/src/auth';

export type DatabaseTarget = {
  environment: AppEnvironment;
  database: string;
  ownerRole: 'mm_owner' | 'mm_prod_owner';
  applicationRole: 'mm_app' | 'mm_prod_app';
  purpose:
    'development' | 'quality_assurance' | 'automated_test' | 'operation' | 'production_regression';
};
export function databaseTarget(
  value: string | undefined,
  options: {
    environment: AppEnvironment;
    role: 'owner' | 'application';
    nodeEnvironment?: string;
    productionTestDatabase?: string;
  },
): DatabaseTarget {
  if (!value) throw new Error('Falta la conexión exclusiva de base de datos.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Conexión de base de datos inválida.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash)
    throw new Error('Conexión de base de datos no autorizada.');
  const database = url.pathname.slice(1);
  const loopback = ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '55432';
  let target: DatabaseTarget | undefined;
  if (options.environment === 'production') {
    if (
      url.hostname === 'postgres' &&
      url.port === '5432' &&
      database === 'manzanas_maracay_production'
    )
      target = {
        environment: 'production',
        database,
        ownerRole: 'mm_prod_owner',
        applicationRole: 'mm_prod_app',
        purpose: 'operation',
      };
    else if (
      loopback &&
      options.nodeEnvironment === 'test' &&
      options.productionTestDatabase === database &&
      /^manzanas_maracay_production_test_[a-f0-9]{12}$/.test(database)
    )
      target = {
        environment: 'production',
        database,
        ownerRole: 'mm_prod_owner',
        applicationRole: 'mm_prod_app',
        purpose: 'production_regression',
      };
  } else if (options.environment === 'staging') {
    if (
      url.hostname === 'postgres' &&
      url.port === '5432' &&
      database === 'manzanas_maracay_staging'
    )
      target = {
        environment: 'staging',
        database,
        ownerRole: 'mm_owner',
        applicationRole: 'mm_app',
        purpose: 'quality_assurance',
      };
  } else if (loopback) {
    if (
      database === 'manzanas_maracay_dev' &&
      (options.environment === 'local' || options.role === 'owner')
    )
      target = {
        environment: 'local',
        database,
        ownerRole: 'mm_owner',
        applicationRole: 'mm_app',
        purpose: 'development',
      };
    if (
      database === 'manzanas_maracay_test' &&
      (options.environment === 'test' || options.role === 'owner')
    )
      target = {
        environment: 'test',
        database,
        ownerRole: 'mm_owner',
        applicationRole: 'mm_app',
        purpose: 'automated_test',
      };
    if (
      options.environment === 'test' &&
      /^manzanas_maracay_migration_test_[a-f0-9]{12}$/.test(database)
    )
      target = {
        environment: 'test',
        database,
        ownerRole: 'mm_owner',
        applicationRole: 'mm_app',
        purpose: 'automated_test',
      };
  }
  if (
    !target ||
    url.username !== (options.role === 'owner' ? target.ownerRole : target.applicationRole)
  )
    throw new Error('El entorno, rol o destino no corresponde a una base exclusiva autorizada.');
  return target;
}
