'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientAccount, ClientSummary } from '@mm/domain';
import { readApi } from './inventory-api';
import {
  CLIENT_PAGE_SIZE,
  clientOptions,
  clientPageUrl,
  mergeClientPages,
} from './client-directory';

export function useClientDirectory(selectedId = '') {
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ClientSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<ClientSummary | null>(null);
  const [selectedError, setSelectedError] = useState('');
  const [selectionAttempt, setSelectionAttempt] = useState(0);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const nextOffset = useRef(0);
  const loadedSearch = useRef('');
  const busy = useRef(false);

  const page = useCallback(async (query: string, offset: number, append: boolean) => {
    controller.current?.abort();
    const currentController = new AbortController();
    controller.current = currentController;
    const sequence = ++request.current;
    busy.current = true;
    setLoading(true);
    setError('');
    try {
      const rows = await readApi<ClientSummary[]>(
        clientPageUrl(query, offset),
        currentController.signal,
      );
      if (sequence !== request.current) return;
      setData((previous) => (append ? mergeClientPages(previous ?? [], rows) : rows));
      loadedSearch.current = query.trim();
      nextOffset.current = offset + rows.length;
      setHasMore(rows.length === CLIENT_PAGE_SIZE);
    } catch (cause) {
      if (sequence === request.current && !currentController.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'No se pudieron consultar los clientes.');
    } finally {
      if (sequence === request.current) {
        busy.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => void page(search, 0, false), search.trim() ? 250 : 0);
    return () => {
      clearTimeout(timer);
      ++request.current;
      controller.current?.abort();
      busy.current = false;
    };
  }, [search, page]);

  useEffect(() => {
    setSelectedError('');
    if (!selectedId) {
      setSelected(null);
      return;
    }
    const present = data?.find((client) => client.id === selectedId);
    if (present) {
      setSelected(present);
      return;
    }
    if (selected?.id === selectedId) return;
    const selectionController = new AbortController();
    let current = true;
    setSelected(null);
    void readApi<ClientAccount>(
      '/api/clients/' + encodeURIComponent(selectedId),
      selectionController.signal,
    )
      .then((account) => {
        if (current && account.client.id === selectedId) setSelected(account.client);
      })
      .catch((cause) => {
        if (current && !selectionController.signal.aborted)
          setSelectedError(
            cause instanceof Error ? cause.message : 'No se pudo recuperar el cliente elegido.',
          );
      });
    return () => {
      current = false;
      selectionController.abort();
    };
  }, [selectedId, data, selected?.id, selectionAttempt]);

  const options = clientOptions(data ?? [], selected?.id === selectedId ? selected : null);
  return {
    data,
    options,
    search,
    setSearch,
    loading,
    error,
    hasMore,
    selectedError,
    reload: () => page(search, 0, false),
    loadMore: () => {
      if (!busy.current && hasMore && loadedSearch.current === search.trim())
        return page(search, nextOffset.current, true);
      return Promise.resolve();
    },
    remember: (client: ClientSummary) => setSelected(client),
    retrySelection: () => setSelectionAttempt((value) => value + 1),
  };
}
