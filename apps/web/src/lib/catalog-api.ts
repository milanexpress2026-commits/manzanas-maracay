import type { Catalog } from '@mm/domain';
function responseMessage(data: unknown, fallback: string): string {
  return data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
    ? data.message : fallback;
}
export async function fetchCatalog(): Promise<Catalog> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('/api/catalog', { cache: 'no-store' });
    // A single safe read retry recovers a classified transient connection failure.
    // Other status codes and every mutation retain their explicit failure behavior.
    if (response.status === 503 && attempt === 0) {
      await response.text();
      continue;
    }
    const data: unknown = await response.json();
    if (!response.ok) throw new Error(responseMessage(data, 'No se pudo cargar el catálogo.'));
    if (!data || typeof data !== 'object' || !['fruits', 'varieties', 'calibers', 'configurations'].every(
      (key) => key in data && Array.isArray((data as Record<string, unknown>)[key]),
    )) throw new Error('El catálogo recibido no tiene el formato esperado. Vuelve a intentar la consulta.');
    return data as Catalog;
  }
  throw new Error('No se pudo cargar el catálogo. Vuelve a intentar la consulta.');
}
export async function saveCatalog(endpoint: string, body: unknown, key: string, editing = false) {
  const response = await fetch(`/api/catalog/${endpoint}`, {
    method: editing ? 'PATCH' : 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error(responseMessage(data, 'No se pudo guardar.'));
  return data;
}
