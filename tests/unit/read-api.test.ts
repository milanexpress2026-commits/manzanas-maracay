import { afterEach, describe, expect, it, vi } from 'vitest';
import { readApi } from '../../apps/web/src/lib/api-read';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('private reads on a slow or interrupted connection', () => {
  it('stops a stalled read and offers a retry instead of loading forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const failed = expect(readApi('/api/sales')).rejects.toThrow('Reintentar');
    await vi.advanceTimersByTimeAsync(20000);
    await failed;
  });
  it('keeps navigation cancellation distinct from a stalled connection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const controller = new AbortController();
    const failed = expect(readApi('/api/sales', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    controller.abort();
    await failed;
  });
  it('does not turn a truncated successful response into an empty list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[{"id":')),
    );
    await expect(readApi('/api/sales')).rejects.toThrow('incompleta');
  });
});
