const SALE_DETAIL =
  /^\/ventas\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\?guardada=1)?$/i;
const INTERNAL_PAGES = new Set([
  '/inicio',
  '/catalogo',
  '/inventario',
  '/recepciones',
  '/ventas',
  '/ventas/nueva',
  '/clientes',
  '/cobranza',
]);

/** Deliberately excludes arbitrary URLs, encoded paths and query strings. */
export function internalReturnPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 100) return undefined;
  return INTERNAL_PAGES.has(value) || SALE_DETAIL.test(value) ? value : undefined;
}
