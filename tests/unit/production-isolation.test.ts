import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { databaseTarget } from '../../packages/database/src/environment';
import { appEnvironmentSchema } from '../../packages/domain/src/auth';
import {
  confirmedPresentationsReady,
  operationIsDemo,
  validateProductionActivation,
  type ProductionActivation,
  type ProductionIdentity,
} from '../../packages/domain/src/production';
import { authConfig, sessionCookie } from '../../apps/api/src/auth/config';
import { assertSeedEnvironment } from '../../scripts/seed';

afterEach(() => vi.unstubAllEnvs());
const expected: ProductionIdentity = {
  release: 'phase4-synthetic-test',
  commit: 'a'.repeat(40),
  database: 'manzanas_maracay_production_test_abcdef123456',
  databaseInstanceId: randomUUID(),
  origin: 'https://localhost:3143',
};
function activation(): ProductionActivation {
  return {
    ...expected,
    version: 1,
    state: 'active',
    environment: 'production',
    activatedAt: '2026-11-05T02:00:00Z',
    approval: {
      reference: 'Synthetic unit fixture; never an operational approval',
      approvedAt: '2026-11-05T01:00:00Z',
      expiresAt: '2026-11-05T03:00:00Z',
    },
    evidence: {
      externalBackupVerified: true,
      isolatedRestoreVerified: true,
      authenticationVerified: true,
      productionAccountVerified: true,
      dataIsolationVerified: true,
      infrastructureVerified: true,
      commercialNonFiscalScopeAcknowledged: true,
      cutoverAuthorized: true,
    },
  };
}
describe('separación REAL/QA y configuración de producción', () => {
  it('reconoce cuatro entornos sin aceptar alias ni valores implícitos del navegador', () => {
    expect(appEnvironmentSchema.options).toEqual(['local', 'test', 'staging', 'production']);
    expect(appEnvironmentSchema.safeParse('preview').success).toBe(false);
    expect(operationIsDemo('production')).toBe(false);
    expect(() => operationIsDemo('production', true)).toThrow('DEMO');
    expect(operationIsDemo('staging', false)).toBe(true);
    expect(operationIsDemo('test', false)).toBe(true);
  });
  it('producción exige HTTPS exacto y conserva cookies Host privadas también en el ensayo local TLS', () => {
    vi.stubEnv('MM_APP_ENV', 'production');
    vi.stubEnv('MM_APP_ORIGIN', 'http://localhost:3143');
    expect(() => authConfig()).toThrow('HTTPS');
    vi.stubEnv('MM_APP_ORIGIN', 'https://localhost:3143/path');
    expect(() => authConfig()).toThrow('origen');
    vi.stubEnv('MM_APP_ORIGIN', 'https://localhost:3143');
    expect(authConfig()).toMatchObject({ environment: 'production', secure: true });
    expect(sessionCookie('a'.repeat(64))).toContain('__Host-mm_session=');
    expect(sessionCookie('a'.repeat(64))).toContain('HttpOnly; SameSite=Strict');
    expect(sessionCookie('a'.repeat(64))).toContain('; Secure');
  });
  it('no permite sembrar producción aunque la conexión exista', () => {
    vi.stubEnv('MM_APP_ENV', 'production');
    expect(() => assertSeedEnvironment()).toThrow('comienza vacía');
    vi.stubEnv('MM_APP_ENV', 'staging');
    expect(() => assertSeedEnvironment()).not.toThrow();
  });
  it('exige base y roles independientes en el destino remoto', () => {
    const url = 'postgresql://mm_prod_app:synthetic@postgres:5432/manzanas_maracay_production';
    expect(databaseTarget(url, { environment: 'production', role: 'application' })).toMatchObject({
      purpose: 'operation',
      applicationRole: 'mm_prod_app',
    });
    for (const bad of [
      url.replace('mm_prod_app', 'mm_app'),
      url.replace('_production', '_staging'),
      url.replace('postgres:5432', 'remote.example:5432'),
      `${url}?options=-csearch_path=other`,
    ])
      expect(() =>
        databaseTarget(bad, { environment: 'production', role: 'application' }),
      ).toThrow();
    expect(() => databaseTarget(url, { environment: 'staging', role: 'application' })).toThrow();
  });
  it('modo production en QA solo acepta scratch local explícita con NODE_ENV=test y rol real limitado', () => {
    const url = `postgresql://mm_prod_app:synthetic@127.0.0.1:55432/${expected.database}`;
    const options = {
      environment: 'production' as const,
      role: 'application' as const,
      nodeEnvironment: 'test',
      productionTestDatabase: expected.database,
    };
    expect(databaseTarget(url, options)).toMatchObject({
      purpose: 'production_regression',
      ownerRole: 'mm_prod_owner',
    });
    expect(() => databaseTarget(url, { ...options, nodeEnvironment: 'production' })).toThrow();
    expect(() => databaseTarget(url, { ...options, productionTestDatabase: undefined })).toThrow();
    expect(() =>
      databaseTarget(url.replace(expected.database, 'manzanas_maracay_test'), options),
    ).toThrow();
    expect(() =>
      databaseTarget(url.replace('127.0.0.1:55432', 'postgres:5432'), options),
    ).toThrow();
  });
  it('confirmar solo caja no inventa conteo; presentar blíster o media exige regla conocida', () => {
    const config = {
      confirmationStatus: 'confirmed' as const,
      packingModel: 'blister',
      halfPreparation: 'pending',
      allowedPresentations: ['box'],
      blistersPerBox: null,
    };
    expect(confirmedPresentationsReady(config)).toBe(true);
    expect(
      confirmedPresentationsReady({ ...config, allowedPresentations: ['box', 'blister'] }),
    ).toBe(false);
    expect(
      confirmedPresentationsReady({ ...config, allowedPresentations: ['box', 'half_box'] }),
    ).toBe(false);
    expect(
      confirmedPresentationsReady({
        ...config,
        confirmationStatus: 'pending',
        allowedPresentations: ['box', 'half_box'],
      }),
    ).toBe(true);
  });
});
describe('activación de release por evidencia y aprobación concreta', () => {
  const now = new Date('2026-11-05T04:00:00Z');
  it('una aprobación usada a tiempo mantiene operación después de su vencimiento inicial', () => {
    expect(validateProductionActivation(activation(), expected, now)).toBe(true);
    expect(
      validateProductionActivation(activation(), expected, new Date('2027-01-01T00:00:00Z')),
    ).toBe(true);
  });
  it('rechaza ausencia, evidencia incompleta, aprobación tardía y activación futura', () => {
    expect(validateProductionActivation(null, expected, now)).toBe(false);
    const noCutover = activation();
    expect(
      validateProductionActivation(
        { ...noCutover, evidence: { ...noCutover.evidence, cutoverAuthorized: false } },
        expected,
        now,
      ),
    ).toBe(false);
    expect(
      validateProductionActivation(
        { ...activation(), activatedAt: '2026-11-05T03:01:00Z' },
        expected,
        now,
      ),
    ).toBe(false);
    expect(
      validateProductionActivation(activation(), expected, new Date('2026-11-05T01:59:00Z')),
    ).toBe(false);
  });
  it('no reutiliza activación entre commits, releases, origen o bases homónimas nuevas', () => {
    for (const key of ['release', 'commit', 'database', 'databaseInstanceId', 'origin'] as const) {
      const changed = {
        ...expected,
        [key]: key === 'databaseInstanceId' ? randomUUID() : `${expected[key]}other`,
      };
      expect(validateProductionActivation(activation(), changed, now)).toBe(false);
    }
  });
});
