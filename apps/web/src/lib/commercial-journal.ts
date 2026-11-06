import { z } from 'zod';
import Decimal from 'decimal.js';
import { manualSaleSchema, paymentSchema } from '@mm/domain';
import { receiptFingerprint, type StorageAccess } from './receipt-storage';

export type CommercialCommandKind = 'sale' | 'payment';
export const COMMERCIAL_JOURNAL_PREFIX = 'mm.commerce.pending.v1:';
export const COMMERCIAL_JOURNAL_EVENT = 'mm-commercial-journal-changed';
const money = z.string().regex(/^\d{1,16}\.\d{2}$/);
const summarySchema = z.object({ totalUsd: money, balanceUsd: money }).strict();
export type CommercialSummary = z.infer<typeof summarySchema>;
const recordSchema = z
  .object({
    version: z.literal(1),
    scope: z.string().regex(/^(local|test|staging|production):[a-f0-9-]{36}$/i),
    kind: z.enum(['sale', 'payment']),
    payloadVersion: z.enum(['sale-manual-v2', 'payment-v1']),
    key: z.uuid(),
    body: z.string().min(2).max(65536),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.iso.datetime(),
    attempts: z.number().int().min(1).max(1000000),
    summary: summarySchema.nullable(),
  })
  .strict();
export type PendingCommercialCommand = z.infer<typeof recordSchema>;

export class CommercialJournalError extends Error {
  constructor(
    message: string,
    readonly editable = false,
    readonly status?: number,
  ) {
    super(message);
  }
}
export function commercialJournalKey(scope: string, kind: CommercialCommandKind) {
  if (!/^(local|test|staging|production):[a-f0-9-]{36}$/i.test(scope))
    throw new CommercialJournalError('No se pudo verificar el usuario y entorno de la operación.');
  return COMMERCIAL_JOURNAL_PREFIX + scope + ':' + kind;
}
export function commercialCommandBody(record: PendingCommercialCommand) {
  const body: unknown = JSON.parse(record.body);
  if (record.kind === 'sale' && record.payloadVersion === 'sale-manual-v2') {
    manualSaleSchema.parse(body);
  } else if (record.kind === 'payment' && record.payloadVersion === 'payment-v1') {
    paymentSchema.parse(body);
  } else throw new CommercialJournalError('La versión de la operación pendiente no es compatible.');
  // Validation must never rewrite the original bytes used by the first attempt.
  return body as ReturnType<typeof manualSaleSchema.parse> | ReturnType<typeof paymentSchema.parse>;
}
export async function readCommercialPending(
  storage: StorageAccess,
  scope: string,
  kind: CommercialCommandKind,
): Promise<PendingCommercialCommand | null> {
  let raw: string | null;
  try {
    raw = storage.getItem(commercialJournalKey(scope, kind));
  } catch {
    throw new CommercialJournalError(
      'No se puede leer la operación pendiente en este dispositivo. Habilita el almacenamiento antes de guardar.',
    );
  }
  if (raw === null) return null;
  try {
    if (raw.length > 80000) throw new Error('size');
    const record = recordSchema.parse(JSON.parse(raw));
    if (
      record.scope !== scope ||
      record.kind !== kind ||
      new TextEncoder().encode(record.body).length > 65536
    )
      throw new Error('scope');
    if ((await receiptFingerprint(record.body)) !== record.hash) throw new Error('hash');
    commercialCommandBody(record);
    return record;
  } catch {
    throw new CommercialJournalError(
      'La operación pendiente no pudo verificarse. Se conservó sin enviar ni sobrescribir; solicita revisión antes de continuar.',
    );
  }
}

type ResponseLike = Pick<Response, 'ok' | 'status' | 'json'>;
export type CommercialJournalDependencies = {
  storage: StorageAccess;
  withLock<T>(name: string, work: () => Promise<T>): Promise<T>;
  send(url: string, key: string, body: string): Promise<ResponseLike>;
  changed?(): void;
};
function persist(
  deps: CommercialJournalDependencies,
  key: string,
  record: PendingCommercialCommand,
) {
  const raw = JSON.stringify(record);
  try {
    deps.storage.setItem(key, raw);
    if (deps.storage.getItem(key) !== raw) throw new Error('verification');
  } catch {
    throw new CommercialJournalError(
      'No se pudo conservar la operación en este dispositivo. No se envió una nueva solicitud. Habilita espacio y almacenamiento y vuelve a intentar.',
    );
  }
  deps.changed?.();
}
async function removeExact(deps: CommercialJournalDependencies, record: PendingCommercialCommand) {
  const key = commercialJournalKey(record.scope, record.kind);
  const current = await readCommercialPending(deps.storage, record.scope, record.kind);
  if (!current || current.key !== record.key || current.hash !== record.hash)
    throw new CommercialJournalError(
      'El pendiente cambió en otra pestaña. No se sobrescribió; revisa la operación conservada.',
    );
  try {
    deps.storage.removeItem(key);
    if (deps.storage.getItem(key) !== null) throw new Error('verification');
  } catch {
    throw new CommercialJournalError(
      'La respuesta llegó, pero no se pudo actualizar el pendiente local. Conserva la misma solicitud para recuperar su comprobante.',
    );
  }
  deps.changed?.();
}
const identitySchema = z
  .object({ id: z.uuid(), number: z.string().min(1), clientId: z.uuid(), isDemo: z.boolean() })
  .passthrough();
export function validCommercialConfirmation(record: PendingCommercialCommand, value: unknown) {
  try {
    const response = identitySchema.parse(value),
      body = commercialCommandBody(record);
    if (
      response.clientId !== body.clientId ||
      response.isDemo !== !record.scope.startsWith('production:')
    )
      return false;
    if (record.kind === 'sale') {
      const sale = manualSaleSchema.parse(body);
      const total = sale.lines.reduce(
        (sum, line) =>
          sum.add(
            new Decimal(line.agreedUnitUsd)
              .mul(line.quantity)
              .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
          ),
        new Decimal(0),
      );
      return (
        typeof response.totalUsd === 'string' &&
        new Decimal(response.totalUsd).eq(total) &&
        Array.isArray(response.lines) &&
        response.lines.length === sale.lines.length
      );
    }
    const payment = paymentSchema.parse(body);
    if (
      response.currency !== payment.currency ||
      typeof response.amount !== 'string' ||
      !new Decimal(response.amount).eq(payment.amount)
    )
      return false;
    const applications = z
      .array(z.object({ saleId: z.uuid(), amountUsd: z.string() }))
      .parse(response.applications);
    return (
      applications.length === payment.applications.length &&
      payment.applications.every((expected) =>
        applications.some(
          (actual) =>
            actual.saleId === expected.saleId &&
            new Decimal(actual.amountUsd).eq(expected.amountUsd),
        ),
      )
    );
  } catch {
    return false;
  }
}

/** One durable slot per account/environment/command. Web Locks serialize all tab writers. */
export async function sendCommercialCommand<T>(
  deps: CommercialJournalDependencies,
  scope: string,
  kind: CommercialCommandKind,
  body: unknown,
  summary: CommercialSummary | null = null,
  expected?: PendingCommercialCommand,
): Promise<T> {
  const storageKey = commercialJournalKey(scope, kind);
  return deps.withLock(storageKey, async () => {
    const existing = await readCommercialPending(deps.storage, scope, kind);
    let record: PendingCommercialCommand;
    if (expected) {
      const verified = recordSchema.parse(expected);
      if (
        verified.scope !== scope ||
        verified.kind !== kind ||
        (await receiptFingerprint(verified.body)) !== verified.hash
      )
        throw new CommercialJournalError('No se pudo verificar la solicitud que deseas recuperar.');
      commercialCommandBody(verified);
      if (existing && (existing.key !== verified.key || existing.hash !== verified.hash))
        throw new CommercialJournalError(
          'Otra pestaña resolvió o cambió esta operación. Actualiza para consultar el comprobante; no se enviaron datos nuevos.',
        );
      // Another tab may already have removed the confirmed slot. Reusing the
      // captured original key/body still recovers the same server receipt.
      record = existing ?? verified;
    } else if (existing) {
      throw new CommercialJournalError(
        'Hay una operación pendiente en otra pestaña. Recupérala antes de registrar otra; no se sobrescribieron sus datos.',
      );
    } else {
      (kind === 'sale' ? manualSaleSchema : paymentSchema).parse(body);
      const json = JSON.stringify(body);
      if (new TextEncoder().encode(json).length > 65536)
        throw new CommercialJournalError(
          'El formulario es demasiado grande. Reduce las líneas antes de guardar.',
          true,
        );
      record = recordSchema.parse({
        version: 1,
        scope,
        kind,
        payloadVersion: kind === 'sale' ? 'sale-manual-v2' : 'payment-v1',
        key: crypto.randomUUID(),
        body: json,
        hash: await receiptFingerprint(json),
        createdAt: new Date().toISOString(),
        attempts: 1,
        summary,
      });
    }
    const firstAttempt = !existing && !expected;
    if (!firstAttempt) record = { ...record, attempts: record.attempts + 1 };
    persist(deps, storageKey, record);
    let response: ResponseLike, result: unknown;
    try {
      response = await deps.send(
        kind === 'sale' ? '/api/sales' : '/api/payments',
        record.key,
        record.body,
      );
      result = await response.json();
    } catch {
      throw new CommercialJournalError(
        'No llegó una confirmación verificable. La solicitud se conserva; reintenta para consultar o completar la misma operación.',
      );
    }
    if (!response.ok) {
      const info = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
      const rejected =
        firstAttempt &&
        [400, 404, 409, 422].includes(response.status) &&
        info.commandOutcome === 'rejected' &&
        info.commandKey === record.key;
      if (rejected) await removeExact(deps, record);
      const message =
        response.status === 401
          ? 'Tu sesión terminó. Inicia sesión de nuevo; la operación pendiente se conserva.'
          : typeof info.message === 'string'
            ? info.message
            : 'No se pudo confirmar la operación. Reintenta con los mismos datos.';
      throw new CommercialJournalError(message, rejected, response.status);
    }
    if (!validCommercialConfirmation(record, result))
      throw new CommercialJournalError(
        'La respuesta no identifica el comprobante esperado. Conservamos la solicitud para recuperarlo sin duplicarlo.',
      );
    await removeExact(deps, record);
    return result as T;
  });
}
