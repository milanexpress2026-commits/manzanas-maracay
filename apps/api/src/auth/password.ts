import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP scrypt profile: N=2^17, r=8, p=1 (128 MiB); one active derivation per API process.
const N = 131072,
  R = 8,
  P = 1,
  LENGTH = 64;
const MAXMEM = 160 * 1024 * 1024;
const FORMAT = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
export const DUMMY_PASSWORD_HASH = `scrypt$${N}$${R}$${P}$${'0'.repeat(32)}$${'0'.repeat(128)}`;

async function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      Buffer.from(salt, 'hex'),
      LENGTH,
      { N, r: R, p: P, maxmem: MAXMEM },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 14 || password.length > 256)
    throw new Error('La contraseña debe tener entre 14 y 256 caracteres.');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `scrypt$${N}$${R}$${P}$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (password.length > 256) return false;
  const parsed = FORMAT.exec(stored);
  // Do not accept attacker-controlled work factors from a malformed hash.
  const salt = parsed?.[1] ?? '0'.repeat(32);
  const expected = Buffer.from(parsed?.[2] ?? '0'.repeat(128), 'hex');
  const actual = await derive(password, salt);
  return timingSafeEqual(expected, actual) && !!parsed;
}
