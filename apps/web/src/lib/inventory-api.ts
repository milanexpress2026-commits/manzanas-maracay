'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COMMERCIAL_JOURNAL_EVENT,
  CommercialJournalError,
  commercialJournalKey,
  readCommercialPending,
  sendCommercialCommand,
  type CommercialCommandKind,
  type CommercialSummary,
  type PendingCommercialCommand,
} from './commercial-journal';
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function decode<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status === 401
        ? 'Tu sesión terminó. Inicia sesión de nuevo para continuar.'
        : (body.message ??
            'No se pudo completar la operación. Conserva los datos y vuelve a intentar.'),
      response.status,
    );
  return body as T;
}
export async function readApi<T>(url: string, signal?: AbortSignal): Promise<T> {
  return decode<T>(await fetch(url, { cache: 'no-store', signal }));
}
export function useRemote<T>(url: string) {
  const [result, setResult] = useState<{ url: string; value: T } | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const sequence = useRef(0),
    controller = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    controller.current?.abort();
    controller.current = new AbortController();
    const id = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const result = await readApi<T>(url, controller.current.signal);
      if (id === sequence.current) setResult({ url, value: result });
    } catch (e) {
      if (id === sequence.current && !(e instanceof DOMException && e.name === 'AbortError'))
        setError(e instanceof Error ? e.message : 'No se pudo conectar con el servidor.');
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void reload();
    return () => {
      ++sequence.current;
      controller.current?.abort();
    };
  }, [reload]);
  return { data: result?.url === url ? result.value : null, loading, error, reload };
}
// The same body retains its command key after a failed request. A confirmed action gets a new key.
export function useCommand() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<{ fingerprint: string; key: string } | null>(null),
    inFlight = useRef(false);
  async function run<T>(url: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
    if (inFlight.current) throw new Error('Hay una operación en curso. Espera su confirmación.');
    const json = JSON.stringify(body),
      fingerprint = `${method}:${url}:${json}`;
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await decode<T>(
        await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.current.key },
          body: json,
        }),
      );
      pending.current = null;
      return result;
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : 'No se pudo guardar. Revisa la conexión e inténtalo de nuevo.';
      setError(message);
      throw e;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { run, busy, error, setError };
}

/** Durable only for financial commands; other low-impact forms keep useCommand. */
export function useDurableCommercialCommand(scope: string, kind: CommercialCommandKind) {
  const [pending, setPending] = useState<PendingCommercialCommand | null>(null);
  const [ready, setReady] = useState(false),
    [storageError, setStorageError] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false);
  const captured = useRef<PendingCommercialCommand | null>(null),
    inFlight = useRef(false);
  const confirmed = useRef<{ body: string; result: unknown } | null>(null);
  const refreshSequence = useRef(0);
  const key = commercialJournalKey(scope, kind);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      if (!navigator.locks?.request)
        throw new CommercialJournalError(
          'Este navegador no permite proteger operaciones entre pestañas. Usa un navegador actualizado antes de guardar.',
        );
      const value = await readCommercialPending(localStorage, scope, kind);
      if (sequence !== refreshSequence.current) return;
      setPending(value);
      if (value) captured.current = value;
      setStorageError('');
    } catch (failure) {
      if (sequence !== refreshSequence.current) return;
      setStorageError(
        failure instanceof Error ? failure.message : 'No se pudo leer el pendiente local.',
      );
    } finally {
      if (sequence === refreshSequence.current) setReady(true);
    }
  }, [scope, kind]);
  useEffect(() => {
    captured.current = null;
    confirmed.current = null;
    setPending(null);
    setReady(false);
    void refresh();
    const changed = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== null && event.key !== key) return;
      void refresh();
    };
    window.addEventListener('storage', changed);
    window.addEventListener(COMMERCIAL_JOURNAL_EVENT, changed);
    return () => {
      ++refreshSequence.current;
      window.removeEventListener('storage', changed);
      window.removeEventListener(COMMERCIAL_JOURNAL_EVENT, changed);
    };
  }, [key, refresh]);
  async function run<T>(body: unknown, summary: CommercialSummary | null = null): Promise<T> {
    if (confirmed.current?.body === JSON.stringify(body)) return confirmed.current.result as T;
    if (inFlight.current) throw new CommercialJournalError('La confirmación ya está en curso.');
    if (!ready || storageError)
      throw new CommercialJournalError(
        storageError || 'Espera mientras se verifica la operación pendiente.',
      );
    inFlight.current = true;
    setBusy(true);
    setError('');
    setAuthNeeded(false);
    try {
      const result = await sendCommercialCommand<T>(
        {
          storage: localStorage,
          withLock: (name, work) =>
            navigator.locks.request(
              name,
              { mode: 'exclusive', ifAvailable: true },
              async (lock) => {
                if (!lock)
                  throw new CommercialJournalError(
                    'Otra pestaña está confirmando esta operación. Espera y recupera el mismo pendiente.',
                  );
                return work();
              },
            ),
          send: (url, commandKey, json) =>
            fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandKey },
              body: json,
              signal: AbortSignal.timeout(65000),
            }),
          changed: () => window.dispatchEvent(new Event(COMMERCIAL_JOURNAL_EVENT)),
        },
        scope,
        kind,
        body,
        summary,
        captured.current ?? undefined,
      );
      captured.current = null;
      confirmed.current = { body: JSON.stringify(body), result };
      return result;
    } catch (failure) {
      if (failure instanceof CommercialJournalError && failure.editable) captured.current = null;
      setAuthNeeded(failure instanceof CommercialJournalError && failure.status === 401);
      setError(
        failure instanceof Error
          ? failure.message
          : 'No se pudo confirmar. La solicitud se conserva.',
      );
      throw failure;
    } finally {
      await refresh();
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { run, pending, ready, storageError, busy, error, setError, refresh, authNeeded };
}
export function displayMoney(value: string) {
  const [whole, decimal = ''] = value.split('.');
  return `USD ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimal.padEnd(2, '0').slice(0, 4)}`;
}
export function displayDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeZone: 'America/Caracas' }).format(
        date,
      );
}
