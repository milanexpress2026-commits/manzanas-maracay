'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readApi } from './inventory-api';

/** Keep selections from earlier pages, but never show another query's rows. */
export function usePagedList<T extends { id: string }>(
  url: string,
  pageSize = 100,
  initialRows?: T[] | null,
) {
  const initial = useRef({ url, rows: initialRows });
  const [result, setResult] = useState<{ url: string; rows: T[] } | null>(
    initialRows ? { url, rows: initialRows } : null,
  );
  const [loading, setLoading] = useState(!initialRows);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(initialRows?.length === pageSize);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const cursor = useRef({ url: initialRows ? url : '', offset: initialRows?.length ?? 0 });
  const busy = useRef(false);
  const page = useCallback(
    async (offset: number) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const sequence = ++request.current;
      busy.current = true;
      setLoading(true);
      setError('');
      try {
        const rows = await readApi<T[]>(
          `${url}${url.includes('?') ? '&' : '?'}limit=${pageSize}&offset=${offset}`,
          abort.signal,
        );
        if (sequence !== request.current) return;
        setResult((previous) => {
          const combined = new Map<string, T>();
          if (offset && previous?.url === url)
            for (const row of previous.rows) combined.set(row.id, row);
          for (const row of rows) combined.set(row.id, row);
          return { url, rows: [...combined.values()] };
        });
        cursor.current = { url, offset: offset + rows.length };
        setHasMore(rows.length === pageSize);
      } catch (cause) {
        if (sequence === request.current && !abort.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial.');
      } finally {
        if (sequence === request.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [url, pageSize],
  );
  useEffect(() => {
    // The authorized server response already contains this first page. Do not
    // repeat it on hydration; later searches/reloads always request fresh data.
    if (request.current === 0 && url === initial.current.url && initial.current.rows) return;
    void page(0);
    return () => {
      ++request.current;
      controller.current?.abort();
      busy.current = false;
    };
  }, [page]);
  const current = result?.url === url;
  return {
    data: current ? result.rows : null,
    loading,
    error,
    hasMore: current && hasMore,
    reload: () => page(0),
    loadMore: () => {
      if (!busy.current && hasMore && cursor.current.url === url)
        return page(cursor.current.offset);
      return Promise.resolve();
    },
  };
}
