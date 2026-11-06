export type DevicePreferences = { favorites: string[]; hidden: string[]; recent: string[] };
export const emptyPreferences = (): DevicePreferences => ({
  favorites: [],
  hidden: [],
  recent: [],
});
export const RECEIPT_STORAGE_PREFIX = 'mm.receipt.v2:';
export const PREFERENCE_STORAGE_PREFIX = 'mm.catalog.preferences.v2:';
export type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function deviceScope(environment: string, userId: string) {
  return `${environment}:${userId}`;
}
export function readPreferences(storage: StorageAccess, scope: string): DevicePreferences {
  try {
    const value = JSON.parse(storage.getItem(PREFERENCE_STORAGE_PREFIX + scope) ?? 'null');
    if (!value || value.version !== 1 || value.scope !== scope) return emptyPreferences();
    const strings = (items: unknown, limit: number) =>
      Array.isArray(items)
        ? [
            ...new Set(
              items.filter(
                (item): item is string => typeof item === 'string' && item.length <= 400,
              ),
            ),
          ].slice(0, limit)
        : [];
    return {
      favorites: strings(value.favorites, 500),
      hidden: strings(value.hidden, 500),
      recent: strings(value.recent, 20),
    };
  } catch {
    return emptyPreferences();
  }
}
export function writePreferences(storage: StorageAccess, scope: string, value: DevicePreferences) {
  storage.setItem(
    PREFERENCE_STORAGE_PREFIX + scope,
    JSON.stringify({ version: 1, scope, ...value }),
  );
}
export function togglePreference(values: string[], key: string) {
  return values.includes(key) ? values.filter((value) => value !== key) : [...values, key];
}
export function rememberProducts(value: DevicePreferences, keys: string[]): DevicePreferences {
  return { ...value, recent: [...new Set([...keys, ...value.recent])].slice(0, 20) };
}
// Authentication/proxy failures say nothing about whether an earlier attempt committed.
export function canEditAfterReceiptResponse(status: number) {
  return [400, 409, 422].includes(status);
}
export type PendingReceipt = { key: string; body: string; hash: string };
export async function receiptFingerprint(body: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))),
  )
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
export async function createPendingReceipt(body: unknown): Promise<PendingReceipt> {
  const json = JSON.stringify(body);
  return { key: crypto.randomUUID(), body: json, hash: await receiptFingerprint(json) };
}
export async function verifyPendingReceipt(value: unknown): Promise<boolean> {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingReceipt>;
  return (
    typeof candidate.key === 'string' &&
    /^[a-f0-9-]{36}$/i.test(candidate.key) &&
    typeof candidate.body === 'string' &&
    candidate.body.length <= 65536 &&
    typeof candidate.hash === 'string' &&
    /^[a-f0-9]{64}$/.test(candidate.hash) &&
    (await receiptFingerprint(candidate.body)) === candidate.hash
  );
}
