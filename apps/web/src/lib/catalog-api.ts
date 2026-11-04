import type { Catalog } from '@mm/domain';
export async function fetchCatalog(): Promise<Catalog> {
  const response = await fetch('/api/catalog', { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? 'No se pudo cargar el catálogo.');
  return data;
}
export async function saveCatalog(endpoint: string, body: unknown, key: string, editing = false) {
  const response = await fetch(`/api/catalog/${endpoint}`, {
    method: editing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message ?? 'No se pudo guardar.');
  return data;
}
