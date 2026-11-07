import { NextRequest, NextResponse } from 'next/server';
import { webAuthConfig } from '@/lib/server-auth';
import { privateHeaders, privateJson, pdfProxyResponse } from '@/lib/private-response';
export const dynamic = 'force-dynamic';
const UUID = '[0-9a-fA-F-]{36}';

function allowedRoute(method: string, endpoint: string) {
  if (method === 'GET')
    return (
      [
        'catalog',
        'catalog/options',
        'receipts/options',
        'health',
        'auth/me',
        'suppliers',
        'inventory',
        'inventory/sale-availability',
        'clients',
        'prices',
        'sales',
        'payments',
        'collections',
        'push/status',
        'rates/current',
        'operations/overview',
      ].includes(endpoint) ||
      new RegExp(`^inventory/lots/${UUID}$`).test(endpoint) ||
      new RegExp(`^(clients|sales|payments)/${UUID}$`).test(endpoint) ||
      new RegExp(`^(sales|payments)/${UUID}/document$`).test(endpoint) ||
      new RegExp(`^sales/${UUID}/delivery-note$`).test(endpoint)
    );
  if (method === 'POST')
    return (
      endpoint === 'inventory/sale-preview' ||
      /^(auth\/(login|logout)|catalog\/(fruits|varieties|calibers|calibers\/batch|configurations|configurations\/batch|preparation|preparation\/preview)|suppliers|receipts|clients|prices|sales|payments|push\/(subscribe|unsubscribe))$/.test(
        endpoint,
      ) ||
      new RegExp(
        `^inventory/lots/${UUID}/(open-box|split-halves|withdraw-blisters|open-blister|prepare-half|adjust)$`,
      ).test(endpoint) ||
      new RegExp(`^inventory/movements/${UUID}/reverse$`).test(endpoint) ||
      new RegExp(`^sales/${UUID}/(dates|cancel)$`).test(endpoint) ||
      new RegExp(`^payments/${UUID}/reverse$`).test(endpoint)
    );
  return (
    method === 'PATCH' &&
    new RegExp(`^(catalog/configurations|catalog/varieties|suppliers|clients)/${UUID}$`).test(
      endpoint,
    )
  );
}

async function limitedBody(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 65536) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    reader.releaseLock();
  }
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join('/');
  if (request.method === 'DELETE')
    return privateJson('No se permite borrar operaciones ni documentos.', 403);
  if (!allowedRoute(request.method, endpoint)) return privateJson('Ruta no disponible.', 404);
  const config = webAuthConfig();
  const read = request.method === 'GET';
  if (!read) {
    const allowed = new Set([config.origin]);
    if (['local', 'test'].includes(config.environment)) {
      const port = new URL(config.origin).port;
      allowed.add(`http://127.0.0.1:${port}`);
      allowed.add(`http://localhost:${port}`);
    }
    const origin = request.headers.get('origin');
    if (!origin || !allowed.has(origin) || request.headers.get('sec-fetch-site') === 'cross-site')
      return privateJson('La solicitud no viene de esta aplicación.', 403);
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return privateJson('Formato inválido.', 415);
  }
  const body = read ? undefined : await limitedBody(request);
  if (body === null) return privateJson('El formulario es demasiado grande.', 413);
  const token = request.cookies.get(config.cookieName)?.value;
  try {
    const response = await fetch(`${config.apiBase}/api/${endpoint}${request.nextUrl.search}`, {
      method: request.method,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        'Content-Type': 'application/json',
        'x-mm-internal': process.env.MM_INTERNAL_TOKEN ?? '',
        'idempotency-key': request.headers.get('idempotency-key') ?? '',
        origin: request.headers.get('origin') ?? '',
        Cookie: token && /^[a-f0-9]{64}$/.test(token) ? `${config.cookieName}=${token}` : '',
      },
      body,
    });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...privateHeaders,
    };
    const cookie = response.headers.get('set-cookie');
    if (cookie && ['auth/login', 'auth/logout'].includes(endpoint)) headers['Set-Cookie'] = cookie;
    if (response.status === 429) headers['Retry-After'] = '60';
    if (
      new RegExp(`^(sales|payments)/${UUID}/document$`).test(endpoint) ||
      new RegExp(`^sales/${UUID}/delivery-note$`).test(endpoint)
    ) {
      return await pdfProxyResponse(response, `documento-${path[1]}.pdf`);
    }
    return new NextResponse(await response.text(), { status: response.status, headers });
  } catch {
    return privateJson(
      'No se pudo conectar con el servidor. Conserva el formulario y vuelve a intentar.',
      503,
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
