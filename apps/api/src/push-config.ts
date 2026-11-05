import { createECDH, ECDH, timingSafeEqual } from 'node:crypto';

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };
export function readVapidConfig(
  env: Record<string, string | undefined> = process.env,
): VapidConfig | null {
  const publicKey = env.MM_VAPID_PUBLIC_KEY;
  const privateKey = env.MM_VAPID_PRIVATE_KEY;
  const subject = env.MM_VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  try {
    if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey))
      return null;
    const url = new URL(subject);
    if (url.protocol !== 'mailto:' && url.protocol !== 'https:') return null;
    if (url.protocol === 'mailto:' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url.pathname)) return null;
    if (url.username || url.password || url.hash || url.search) return null;
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'));
    const expected = ecdh.getPublicKey();
    const actual = Buffer.from(publicKey, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    return { publicKey, privateKey, subject };
  } catch {
    return null;
  }
}

export function validBrowserPushKey(value: string) {
  try {
    const key = Buffer.from(value, 'base64url');
    return key.length === 65 && key[0] === 4 && ECDH.convertKey(key, 'prime256v1').length === 65;
  } catch {
    return false;
  }
}
