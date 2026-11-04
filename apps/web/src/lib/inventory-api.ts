'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  const [data, setData] = useState<T | null>(null),
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
      if (id === sequence.current) setData(result);
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
  return { data, loading, error, reload };
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
