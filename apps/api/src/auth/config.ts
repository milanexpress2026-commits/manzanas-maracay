import type { AppEnvironment } from '../../../../packages/domain/src/auth';

export function authConfig() {
  const environment = process.env.MM_APP_ENV ?? 'local';
  if (!['local', 'test', 'staging'].includes(environment)) throw new Error('MM_APP_ENV inválido.');
  const origin = process.env.MM_APP_ORIGIN ?? `http://127.0.0.1:${process.env.MM_WEB_PORT ?? 3100}`;
  const parsed = new URL(origin);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.origin !== origin ||
    parsed.username ||
    parsed.password
  )
    throw new Error('MM_APP_ORIGIN debe ser un origen sin ruta ni credenciales.');
  if (
    environment === 'staging' &&
    (parsed.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
  )
    throw new Error('Staging requiere MM_APP_ORIGIN HTTPS con dominio confirmado.');
  if (environment !== 'staging' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
    throw new Error('El entorno local o test solo admite origen loopback.');
  const secure = environment === 'staging';
  return {
    environment: environment as AppEnvironment,
    origin,
    secure,
    cookieName: secure ? '__Host-mm_session' : 'mm_session',
  };
}

export function sessionCookie(token: string, clear = false) {
  const config = authConfig();
  return `${config.cookieName}=${clear ? '' : token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 8 * 3600}${config.secure ? '; Secure' : ''}`;
}
export function sessionToken(cookie: string | undefined): string | undefined {
  const name = authConfig().cookieName;
  const entry = cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  const token = entry?.slice(name.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}
