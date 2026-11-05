import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { AppEnvironment, SessionInfo } from '../../../../packages/domain/src/auth';

export function webAuthConfig() {
  const environment = process.env.MM_APP_ENV ?? 'local';
  const origin = process.env.MM_APP_ORIGIN ?? `http://127.0.0.1:${process.env.MM_WEB_PORT ?? 3100}`;
  if (!['local', 'test', 'staging', 'production'].includes(environment))
    throw new Error('Entorno inválido.');
  const parsed = new URL(origin);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.origin !== origin ||
    parsed.username ||
    parsed.password
  )
    throw new Error('Origen inválido.');
  if (
    environment === 'staging' &&
    (parsed.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
  )
    throw new Error('Staging requiere HTTPS.');
  if (environment === 'production' && parsed.protocol !== 'https:')
    throw new Error('Producción requiere un origen HTTPS exacto.');
  if (
    ['local', 'test'].includes(environment) &&
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  )
    throw new Error('El entorno local requiere origen loopback.');
  const apiBase =
    process.env.MM_API_BASE_URL ?? `http://127.0.0.1:${process.env.MM_API_PORT ?? 3101}`;
  const api = new URL(apiBase);
  if (
    !['http:', 'https:'].includes(api.protocol) ||
    api.username ||
    api.password ||
    api.pathname !== '/' ||
    api.search ||
    api.hash
  )
    throw new Error('La dirección interna de API no es válida.');
  return {
    environment: environment as AppEnvironment,
    origin,
    apiBase: api.origin,
    cookieName: ['staging', 'production'].includes(environment)
      ? '__Host-mm_session'
      : 'mm_session',
  };
}

export async function getSession(): Promise<SessionInfo | null> {
  const config = webAuthConfig();
  const token = (await cookies()).get(config.cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const response = await fetch(`${config.apiBase}/api/auth/me`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    headers: {
      'x-mm-internal': process.env.MM_INTERNAL_TOKEN ?? '',
      Cookie: `${config.cookieName}=${token}`,
    },
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('No se pudo verificar la sesión. Vuelve a intentar.');
  const session = (await response.json()) as SessionInfo;
  if (session.environment !== config.environment)
    throw new Error('El entorno de la sesión no corresponde a esta aplicación.');
  if (config.environment === 'production' && typeof session.operationsReady !== 'boolean')
    throw new Error('No se pudo verificar el estado de la operación.');
  return session;
}

export async function requireSession(): Promise<SessionInfo> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}
