import { describe, expect, it, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from '../../apps/api/src/auth/password';
import { authConfig, sessionCookie, sessionToken } from '../../apps/api/src/auth/config';
import { invitationSchema, loginSchema } from '../../packages/domain/src/auth';

const originalEnvironment = process.env.MM_APP_ENV;
const originalOrigin = process.env.MM_APP_ORIGIN;
afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.MM_APP_ENV;
  else process.env.MM_APP_ENV = originalEnvironment;
  if (originalOrigin === undefined) delete process.env.MM_APP_ORIGIN;
  else process.env.MM_APP_ORIGIN = originalOrigin;
});

describe('credenciales y cookies de la vista previa', () => {
  it('la persistencia exige selección booleana explícita y la invitación acepta la longitud elegida', () => {
    const input = { username: 'PruebaSesion', password: 'QA-demo-9' };
    expect(loginSchema.parse(input)).toMatchObject({
      username: 'pruebasesion',
      rememberSession: false,
    });
    expect(loginSchema.parse({ ...input, rememberSession: true }).rememberSession).toBe(true);
    expect(loginSchema.safeParse({ ...input, rememberSession: 'true' }).success).toBe(false);
    expect(invitationSchema.safeParse({ ...input, displayName: 'Prueba' }).success).toBe(true);
    expect(
      invitationSchema.safeParse({ ...input, displayName: 'Prueba', password: '1234567' }).success,
    ).toBe(false);
  });
  it('30 días solo para la cookie recordada y logout siempre la elimina', () => {
    process.env.MM_APP_ENV = 'production';
    process.env.MM_APP_ORIGIN = 'https://localhost:3143';
    const token = randomBytes(32).toString('hex');
    expect(sessionCookie(token)).toContain('Max-Age=28800');
    const remembered = sessionCookie(token, false, true);
    expect(remembered).toContain('Max-Age=2592000');
    expect(remembered).toContain('; Secure');
    expect(remembered).toContain('; HttpOnly');
    expect(remembered).toContain('; SameSite=Strict');
    expect(remembered).not.toContain('Domain=');
    expect(sessionCookie(token, true, true)).toContain('__Host-mm_session=;');
    expect(sessionCookie(token, true, true)).toContain('Max-Age=0');
  });
  it('usa sal única y verifica la contraseña sin aceptar otra', async () => {
    const password = randomBytes(24).toString('base64url');
    const hash = await hashPassword(password);
    expect(hash).not.toContain(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(`${password}!`, hash)).toBe(false);
    expect(await hashPassword(password)).not.toBe(hash);
  }, 15000);
  it('rechaza contraseñas débiles y nombres con caracteres de control', () => {
    expect(
      invitationSchema.safeParse({ username: 'prueba', displayName: 'Prueba', password: 'corta' })
        .success,
    ).toBe(false);
    expect(
      invitationSchema.safeParse({
        username: 'usuario\r\n',
        displayName: 'Prueba',
        password: randomBytes(24).toString('hex'),
      }).success,
    ).toBe(true); // Outer whitespace is normalized.
    expect(
      invitationSchema.safeParse({
        username: 'usu\r\nario',
        displayName: 'Prueba',
        password: randomBytes(24).toString('hex'),
      }).success,
    ).toBe(false);
  });
  it('staging exige HTTPS y genera cookie Host, Secure, HttpOnly y SameSite', () => {
    process.env.MM_APP_ENV = 'staging';
    process.env.MM_APP_ORIGIN = 'http://staging.example.test';
    expect(() => authConfig()).toThrow('HTTPS');
    process.env.MM_APP_ORIGIN = 'https://[::1]';
    expect(() => authConfig()).toThrow('HTTPS');
    process.env.MM_APP_ORIGIN = 'https://staging.example.test';
    const token = randomBytes(32).toString('hex');
    const cookie = sessionCookie(token);
    expect(cookie).toContain('__Host-mm_session=');
    expect(cookie).toContain('; Secure');
    expect(cookie).toContain('; HttpOnly');
    expect(cookie).toContain('; SameSite=Strict');
    expect(cookie).not.toContain('Domain=');
    expect(sessionToken(cookie)).toBe(token);
    expect(sessionCookie('', true)).toContain('Max-Age=0');
  });
  it('el entorno local no admite un origen externo ni tokens malformados', () => {
    process.env.MM_APP_ENV = 'local';
    process.env.MM_APP_ORIGIN = 'https://external.example.test';
    expect(() => authConfig()).toThrow('loopback');
    process.env.MM_APP_ORIGIN = 'ftp://127.0.0.1:3100';
    expect(() => authConfig()).toThrow('origen');
    process.env.MM_APP_ORIGIN = 'http://127.0.0.1:3100';
    expect(sessionToken('mm_session=malformed')).toBeUndefined();
  });
});
