import { createECDH, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  release: vi.fn(),
  end: vi.fn(),
  send: vi.fn(),
}));
vi.mock('pg', () => ({
  Pool: class {
    on = vi.fn();
    query = mocks.query;
    connect = mocks.connect;
    end = mocks.end;
  },
}));
vi.mock('web-push', () => ({ default: { sendNotification: mocks.send } }));
import { PushService } from '../../apps/api/src/push.service';

function configureSyntheticKeys() {
  const pair = createECDH('prime256v1');
  pair.generateKeys();
  vi.stubEnv('MM_VAPID_PUBLIC_KEY', pair.getPublicKey().toString('base64url'));
  vi.stubEnv('MM_VAPID_PRIVATE_KEY', pair.getPrivateKey().toString('base64url'));
  vi.stubEnv('MM_VAPID_SUBJECT', 'https://synthetic-unit-test.example');
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubEnv('MM_VAPID_PUBLIC_KEY', '');
  vi.stubEnv('MM_VAPID_PRIVATE_KEY', '');
  vi.stubEnv('MM_VAPID_SUBJECT', '');
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes('pg_try_advisory_xact_lock') ? [{ acquired: true }] : [],
    rowCount: 0,
  }));
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.end.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('límites del servicio push antes del opt-in corporativo', () => {
  it('sin VAPID no inicia consultas periódicas ni transporte', async () => {
    const service = new PushService();
    try {
      service.onModuleInit();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(mocks.connect).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
    } finally {
      await service.onModuleDestroy();
    }
  });

  it('con VAPID y sin tablet activa consulta periódicamente, pero nunca llama al proveedor', async () => {
    configureSyntheticKeys();
    const service = new PushService();
    try {
      service.onModuleInit();
      await vi.advanceTimersByTimeAsync(180_000);
      expect(mocks.connect).toHaveBeenCalledTimes(3);
      expect(mocks.release).toHaveBeenCalledTimes(3);
      expect(mocks.send).not.toHaveBeenCalled();
      expect(await service.status()).toMatchObject({
        configured: true,
        subscribed: false,
        deviceLabel: null,
        endpointHash: null,
      });
    } finally {
      await service.onModuleDestroy();
    }
  });

  it('un destino de metadatos es rechazado antes de transacción o petición externa', async () => {
    configureSyntheticKeys();
    const service = new PushService();
    try {
      await expect(
        service.subscribe(
          {
            deviceLabel: 'Tablet de prueba',
            subscription: {
              endpoint: 'https://169.254.169.254/latest/meta-data',
              keys: { p256dh: 'A'.repeat(87), auth: 'a'.repeat(22) },
            },
          },
          randomUUID(),
          randomUUID(),
        ),
      ).rejects.toThrow();
      expect(mocks.connect).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
    } finally {
      await service.onModuleDestroy();
    }
  });
});
