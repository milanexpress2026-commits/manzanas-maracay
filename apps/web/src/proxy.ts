import { NextResponse } from 'next/server';

// Reject the complete demo tree before React starts streaming HTML or an RSC response.
// The page checks remain as defense in depth; only the server environment chooses access.
export function proxy() {
  const environment = process.env.MM_APP_ENV ?? 'local';
  if (!['local', 'test', 'staging'].includes(environment))
    return new NextResponse('Página no disponible.', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex',
      },
    });
  return NextResponse.next();
}

export const config = { matcher: '/demo/:path*' };
