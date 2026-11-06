import type { ClientSummary } from '@mm/domain';

export const CLIENT_PAGE_SIZE = 200;

export function clientPageUrl(search: string, offset = 0) {
  const params = new URLSearchParams({ limit: String(CLIENT_PAGE_SIZE), offset: String(offset) });
  if (search.trim()) params.set('search', search.trim());
  return '/api/clients?' + params.toString();
}

export function mergeClientPages(current: ClientSummary[], incoming: ClientSummary[]) {
  const clients = new Map(current.map((client) => [client.id, client]));
  for (const client of incoming) clients.set(client.id, client);
  return [...clients.values()];
}

export function clientOptions(rows: ClientSummary[], selected: ClientSummary | null) {
  return selected && !rows.some((client) => client.id === selected.id) ? [selected, ...rows] : rows;
}
