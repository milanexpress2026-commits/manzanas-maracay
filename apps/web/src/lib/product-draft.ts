// Suggestions guide an explicit choice; they never create catalog rows or packing data.
export type CatalogFamily = 'apple' | 'bulk' | 'pear' | 'kiwi' | 'grape' | 'other';
export const caliberSuggestions: Partial<Record<CatalogFamily, readonly string[]>> = {
  apple: ['80', '88', '100', '113', '125', '135', '150', '163', '175', '198', '216'],
  bulk: ['150', '163', '175', '198', '216', '232'],
  pear: ['70', '80', '90', '100', '110', '120', '135'],
};
export function catalogFamilyFor(name: string): CatalogFamily {
  const normalized = name.trim().toLocaleLowerCase('es');
  if (['manzana', 'manzanas'].includes(normalized)) return 'apple';
  if (['pera', 'peras'].includes(normalized)) return 'pear';
  if (['kiwi', 'kiwis'].includes(normalized)) return 'kiwi';
  if (['uva', 'uvas'].includes(normalized)) return 'grape';
  return 'other';
}
export function mergeCatalogRows<T extends { id: string }>(current: T[], received: T[]): T[] {
  const byId = new Map(current.map((row) => [row.id, row]));
  for (const row of received) byId.set(row.id, row);
  return [...byId.values()];
}
export function productReceiptHref(configurationId: string, returnToSale = false): string {
  const params = new URLSearchParams({ producto: configurationId });
  if (returnToSale) params.set('returnTo', '/ventas/nueva');
  return `/recepciones?${params.toString()}`;
}
