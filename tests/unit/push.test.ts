import { createECDH } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  allowedPushEndpoint,
  caracasBusinessDate,
  collectionPushPayload,
  pushSubscribeSchema,
} from '../../packages/domain/src/push';
import { readVapidConfig, validBrowserPushKey } from '../../apps/api/src/push-config';
import {
  dispatchCollectionPush,
  type PushBatch,
  type PushDispatchStore,
} from '../../apps/api/src/push-dispatch';

const pair = () => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString('base64url'),
    privateKey: ecdh.getPrivateKey().toString('base64url'),
  };
};
const batch = (): PushBatch => ({
  id: 'test-batch',
  generation: 'test-generation',
  subscription: {
    endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-unit-test',
    keys: { p256dh: 'synthetic', auth: 'synthetic' },
  },
});
const store = (overrides: Partial<PushDispatchStore> = {}): PushDispatchStore => ({
  claim: async () => batch(),
  revalidate: async () => true,
  finish: async () => {},
  ...overrides,
});

describe('suscripción de cobranza limitada a servicios push conocidos', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/token',
    'https://fcm.googleapis.com/wp/token',
    'https://updates.push.services.mozilla.com/wpush/v2/token',
    'https://web.push.apple.com/token',
  ])('admite servicio conocido %s', (url) => {
    expect(allowedPushEndpoint(url)).toBe(true);
  });
  it.each([
    'http://fcm.googleapis.com/fcm/send/token',
    'https://127.0.0.1/private',
    'https://169.254.169.254/latest/meta-data',
    'https://fcm.googleapis.com.evil.example/fcm/send/x',
    'https://user:password@fcm.googleapis.com/fcm/send/x',
    'https://fcm.googleapis.com:444/fcm/send/x',
    'https://fcm.googleapis.com/arbitrary/path',
    'https://evil.example/push',
    'https://fcm.googleapis.com/fcm/send/x?redirect=internal',
  ])('rechaza endpoint con riesgo SSRF %s', (url) => {
    expect(allowedPushEndpoint(url)).toBe(false);
  });
  it('rechaza campos de privilegios y no transforma reemplazo en autorización implícita', () => {
    const keys = pair();
    const input = {
      deviceLabel: 'Tablet principal',
      subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/test',
        keys: { p256dh: keys.publicKey, auth: 'a'.repeat(22) },
      },
    };
    expect(pushSubscribeSchema.parse(input).replaceExisting).toBe(false);
    expect(pushSubscribeSchema.safeParse({ ...input, actor: 'another-user' }).success).toBe(false);
    expect(pushSubscribeSchema.safeParse({ ...input, replaceExisting: 'true' }).success).toBe(
      false,
    );
  });
  it('exige punto P-256 válido del navegador, sin aceptar longitud solamente', () => {
    expect(validBrowserPushKey(pair().publicKey)).toBe(true);
    expect(validBrowserPushKey('A'.repeat(87))).toBe(false);
  });
  it('VAPID ausente, incompleto o claves distintas deja deshabilitado el transporte', () => {
    expect(readVapidConfig({})).toBeNull();
    const keys = pair();
    const env = {
      MM_VAPID_PUBLIC_KEY: keys.publicKey,
      MM_VAPID_PRIVATE_KEY: keys.privateKey,
      MM_VAPID_SUBJECT: 'https://manzanas.example.test',
    };
    expect(readVapidConfig(env)).toEqual({ ...keys, subject: env.MM_VAPID_SUBJECT });
    expect(readVapidConfig({ ...env, MM_VAPID_PRIVATE_KEY: pair().privateKey })).toBeNull();
    expect(readVapidConfig({ ...env, MM_VAPID_SUBJECT: 'file:///private' })).toBeNull();
  });
  it('fecha interna usa Caracas independientemente de zona del navegador/host', () => {
    expect(caracasBusinessDate(new Date('2026-11-05T03:59:59Z'))).toBe('2026-11-04');
    expect(caracasBusinessDate(new Date('2026-11-05T04:00:00Z'))).toBe('2026-11-05');
  });
});

describe('despacho de aviso agrupado sin destinatarios externos en tests', () => {
  it('no envía si no hay dispositivo/candidatos reclamados', async () => {
    const send = vi.fn();
    expect(await dispatchCollectionPush(store({ claim: async () => null }), send)).toBe('idle');
    expect(send).not.toHaveBeenCalled();
  });
  it('revalida saldo/fecha/dispositivo y cancela antes de enviar si ya no corresponde', async () => {
    const send = vi.fn();
    expect(await dispatchCollectionPush(store({ revalidate: async () => false }), send)).toBe(
      'cancelled',
    );
    expect(send).not.toHaveBeenCalled();
  });
  it('envía un único aviso genérico; aceptación del proveedor no significa entrega en tablet', async () => {
    const finish = vi.fn();
    const send = vi.fn(async (_subscription: PushBatch['subscription'], _payload: string) => ({
      statusCode: 201,
    }));
    expect(await dispatchCollectionPush(store({ finish }), send)).toBe('accepted');
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(send.mock.calls[0]![1]!)).toEqual(collectionPushPayload());
    expect(Object.keys(collectionPushPayload()).sort()).toEqual(['body', 'tag', 'title', 'url']);
    expect(finish).toHaveBeenCalledWith(batch(), 'accepted', '201');
  });
  it('timeout ambiguo se registra sin reintento que pueda duplicar aviso', async () => {
    const finish = vi.fn();
    const send = vi.fn(async () => {
      throw new Error('sensitive endpoint not logged');
    });
    expect(await dispatchCollectionPush(store({ finish }), send)).toBe('uncertain');
    expect(send).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith(batch(), 'uncertain', 'transport_uncertain');
  });
  it('suscripción caducada conserva resultado seguro para invalidar solo esa generación', async () => {
    const finish = vi.fn();
    const send = vi.fn(async () => {
      throw { statusCode: 410, body: 'private endpoint details' };
    });
    expect(await dispatchCollectionPush(store({ finish }), send)).toBe('failed');
    expect(finish).toHaveBeenCalledWith(batch(), 'failed', '410');
  });
});
