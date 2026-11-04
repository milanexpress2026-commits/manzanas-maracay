import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join('/');
  const read = request.method === 'GET' && ['catalog', 'health'].includes(endpoint);
  const write =
    request.method === 'POST' &&
    /^catalog\/(fruits|varieties|calibers|configurations)$/.test(endpoint);
  const edit =
    request.method === 'PATCH' && /^catalog\/configurations\/[0-9a-f-]{36}$/.test(endpoint);
  if (!read && !write && !edit)
    return NextResponse.json({ message: 'Ruta no disponible.' }, { status: 404 });
  if (!read) {
    const origin = request.headers.get('origin');
    const allowed = new Set([
      `http://127.0.0.1:${process.env.MM_WEB_PORT ?? 3100}`,
      `http://localhost:${process.env.MM_WEB_PORT ?? 3100}`,
    ]);
    if (!origin || !allowed.has(origin))
      return NextResponse.json(
        { message: 'Abre la aplicación local para guardar.' },
        { status: 403 },
      );
    if (!request.headers.get('content-type')?.startsWith('application/json'))
      return NextResponse.json({ message: 'Formato inválido.' }, { status: 415 });
  }
  const body = read ? undefined : await request.text();
  if (body && body.length > 10000)
    return NextResponse.json({ message: 'El formulario es demasiado grande.' }, { status: 413 });
  try {
    const response = await fetch(
      `http://127.0.0.1:${process.env.MM_API_PORT ?? 3101}/api/${endpoint}`,
      {
        method: request.method,
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
        headers: {
          'Content-Type': 'application/json',
          'x-mm-internal': process.env.MM_INTERNAL_TOKEN ?? '',
          'idempotency-key': request.headers.get('idempotency-key') ?? '',
        },
        body,
      },
    );
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json(
      {
        message: 'No se pudo conectar con el servidor. Conserva el formulario y vuelve a intentar.',
      },
      { status: 503 },
    );
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH };
