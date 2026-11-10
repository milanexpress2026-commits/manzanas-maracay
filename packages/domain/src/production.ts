import { z } from 'zod';
import type { AppEnvironment } from './auth';

const instant = z.iso.datetime({ offset: true });
export const productionActivationSchema = z
  .object({
    version: z.literal(1),
    state: z.literal('active'),
    environment: z.literal('production'),
    release: z.string().min(1).max(100),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    database: z.string().min(1).max(63),
    databaseInstanceId: z.uuid(),
    origin: z.url(),
    activatedAt: instant,
    approval: z
      .object({ reference: z.string().min(1).max(250), approvedAt: instant, expiresAt: instant })
      .strict(),
    evidence: z
      .object({
        externalBackupVerified: z.literal(true),
        isolatedRestoreVerified: z.literal(true),
        authenticationVerified: z.literal(true),
        productionAccountVerified: z.literal(true),
        dataIsolationVerified: z.literal(true),
        infrastructureVerified: z.literal(true),
        commercialNonFiscalScopeAcknowledged: z.literal(true),
        cutoverAuthorized: z.literal(true),
      })
      .strict(),
  })
  .strict();
export type ProductionActivation = z.infer<typeof productionActivationSchema>;
export type ProductionIdentity = Pick<
  ProductionActivation,
  'release' | 'commit' | 'database' | 'databaseInstanceId' | 'origin'
>;

/** Approval expires before activation, never in the middle of normal business operations. */
export function validateProductionActivation(
  value: unknown,
  expected: ProductionIdentity,
  now = new Date(),
): boolean {
  const parsed = productionActivationSchema.safeParse(value);
  if (!parsed.success || !Number.isFinite(now.getTime())) return false;
  const data = parsed.data;
  if (
    (Object.keys(expected) as (keyof ProductionIdentity)[]).some(
      (key) => data[key] !== expected[key],
    )
  )
    return false;
  const origin = new URL(data.origin);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== data.origin ||
    origin.username ||
    origin.password
  )
    return false;
  const approved = Date.parse(data.approval.approvedAt),
    expires = Date.parse(data.approval.expiresAt),
    activated = Date.parse(data.activatedAt);
  return approved <= activated && activated <= expires && activated <= now.getTime();
}

/** The client may never choose DEMO data inside a real environment. */
export function operationIsDemo(environment: AppEnvironment, requested = false): boolean {
  if (environment === 'production') {
    if (requested) throw new Error('Producción no admite registros DEMO.');
    return false;
  }
  return environment === 'staging' || environment === 'test' || requested;
}

export function confirmedPresentationsReady(value: {
  confirmationStatus: 'pending' | 'confirmed';
  packingModel: string;
  halfPreparation: string;
  allowedPresentations: string[];
  blistersPerBox: number | null;
}): boolean {
  if (value.confirmationStatus !== 'confirmed') return true;
  const presentations = value.allowedPresentations;
  return (
    new Set(presentations).size === presentations.length &&
    (!presentations.includes('blister') ||
      (value.packingModel === 'blister' && value.blistersPerBox !== null)) &&
    (!presentations.includes('half_box') ||
      (value.packingModel === 'blister' && value.blistersPerBox !== null) ||
      ['counted', 'commercial'].includes(value.halfPreparation))
  );
}
