'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readApi } from './inventory-api';

const PAGE_SIZE = 100;

/** Keep selections from earlier pages, but never show another query's rows. */
export function usePagedList<T extends { id: string }>(url: string) {
  const [result, setResult] = useState<{ url: string; rows: T[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const cursor = useRef({ url: '', offset: 0 });
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
          `${url}${url.includes('?') ? '&' : '?'}limit=${PAGE_SIZE}&offset=${offset}`,
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
        setHasMore(rows.length === PAGE_SIZE);
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
    [url],
  );
  useEffect(() => {
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
