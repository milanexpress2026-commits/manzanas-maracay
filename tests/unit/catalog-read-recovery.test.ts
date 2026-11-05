import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  databaseConnectionTimeout,
  databaseDiagnosticCode,
} from '../../apps/api/src/database-failure';
import { fetchCatalog, saveCatalog } from '../../apps/web/src/lib/catalog-api';
const empty = { fruits: [], varieties: [], calibers: [], configurations: [] };
const reply = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());

describe('safe database timeout diagnosis', () => {
  it.each([
    ['timeout exceeded when trying to connect', 'PG_POOL_ACQUIRE_TIMEOUT'],
    ['Connection terminated due to connection timeout', 'PG_CONNECTION_TIMEOUT'],
    ['timeout expired', 'PG_SOCKET_CONNECT_TIMEOUT'],
  ])(
    'classifies exact pg library message without exposing its wrapper: %s',
    (message, category) => {
      const wrapped = new Error('private SQL or connection URL must never be logged', {
        cause: new Error(message),
      });
      expect(databaseConnectionTimeout(wrapped)).toBe(category);
    },
  );
  it('does not mistake arbitrary messages, statement timeout or circular causes for a connection failure', () => {
    expect(databaseConnectionTimeout(new Error('Query read timeout'))).toBeNull();
    expect(databaseConnectionTimeout(new Error('timeout expired: private detail'))).toBeNull();
    expect(
      databaseConnectionTimeout({
        code: '57014',
        message: 'canceling statement due to statement timeout',
      }),
    ).toBeNull();
    const circular: { cause?: unknown } = {};
    circular.cause = circular;
    expect(databaseConnectionTimeout(circular)).toBeNull();
    expect(databaseDiagnosticCode('postgresql://private')).toBe('unknown');
    expect(databaseDiagnosticCode('57014')).toBe('57014');
  });
});

describe('one bounded catalog read retry', () => {
  it('503 then 200 recovers using GET without introducing a mutation', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { message: 'Temporary connection timeout' }))
      .mockResolvedValueOnce(reply(200, empty));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchCatalog()).resolves.toEqual(empty);
    expect(fetch.mock.calls).toEqual([
      ['/api/catalog', { cache: 'no-store' }],
      ['/api/catalog', { cache: 'no-store' }],
    ]);
  });
  it('two 503 responses surface the server error and stop', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => reply(503, { message: 'Reintenta la consulta.' }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchCatalog()).rejects.toThrow('Reintenta la consulta.');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([400, 401, 403, 500])('does not retry HTTP %s', async (status) => {
    const fetch = vi.fn().mockResolvedValue(reply(status, { message: 'Explicit failure' }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchCatalog()).rejects.toThrow('Explicit failure');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not retry a rejected connection or catalog POST, even for HTTP 503', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(reply(503, { message: 'Mutation failed' }));
    vi.stubGlobal('fetch', fetch);
    await expect(fetchCatalog()).rejects.toThrow('Network failure');
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(saveCatalog('fruits', { name: 'QA fruit' }, 'test-key')).rejects.toThrow(
      'Mutation failed',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      headers: { 'Idempotency-Key': 'test-key' },
    });
  });
});
