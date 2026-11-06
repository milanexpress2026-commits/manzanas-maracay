import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { internalReturnPath } from '../../apps/web/src/lib/auth-return';
import { pdfProxyResponse, privateJson } from '../../apps/web/src/lib/private-response';
import { readProtectedPdf } from '../../apps/web/src/lib/protected-pdf';

const id = '11111111-2222-4333-8444-555555555555';
const url = `/api/sales/${id}/delivery-note?size=letter&download=1`;
afterEach(() => vi.unstubAllGlobals());

describe('documentos privados en web', () => {
  it('transmite bytes y disposición segura sin cachear el PDF', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 10, 0, 255]);
    const result = await pdfProxyResponse(
      new Response(bytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="entrega.pdf"',
        },
      }),
      'documento.pdf',
    );
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(bytes);
    expect(result.headers.get('Content-Type')).toBe('application/pdf');
    expect(result.headers.get('Content-Disposition')).toBe('inline; filename="entrega.pdf"');
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
  it.each([401, 403, 404, 429, 503])(
    'conserva estado %s sin entregar HTML ni información del backend',
    async (status) => {
      const result = await pdfProxyResponse(
        new Response('<html>private-backend-detail</html>', {
          status,
          headers: { 'Content-Type': 'text/html' },
        }),
        'documento.pdf',
      );
      expect(result.status).toBe(status);
      expect(result.headers.get('Content-Type')).toContain('application/json');
      expect(result.headers.get('Cache-Control')).toBe('no-store');
      expect(result.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(await result.text()).not.toMatch(/html|private-backend-detail/);
    },
  );
  it.each([
    ['text/html', '<html>login</html>'],
    ['application/json', '{"message":"login"}'],
    ['application/pdf', '<html>not a PDF</html>'],
  ])('rechaza respuesta200 falsa %s', async (type, body) => {
    const result = await pdfProxyResponse(
      new Response(body, { headers: { 'Content-Type': type } }),
      'documento.pdf',
    );
    expect(result.status).toBe(502);
    expect(result.headers.get('Content-Type')).toContain('application/json');
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });
  it('no propaga nombres de archivo no confiables', async () => {
    const result = await pdfProxyResponse(
      new Response('%PDF-1.7', {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="../../document.html"',
        },
      }),
      'documento.pdf',
    );
    expect(result.headers.get('Content-Disposition')).toBe('attachment; filename="documento.pdf"');
    expect(privateJson('Sin conexión', 503).headers.get('Cache-Control')).toBe('no-store');
  });
  it('el cliente descarga solo un PDF validado, con sesión y sin cache', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }),
      );
    vi.stubGlobal('fetch', fetch);
    const blob = await readProtectedPdf(url);
    expect(blob.type).toBe('application/pdf');
    expect(await blob.text()).toBe('%PDF-1.7');
    expect(fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
      }),
    );
  });
  it('el cliente rechaza HTML incluso si el servidor lo etiqueta PDF', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('<html>login</html>', { headers: { 'Content-Type': 'application/pdf' } }),
        ),
    );
    await expect(readProtectedPdf(url)).rejects.toMatchObject({ status: 502 });
  });
  it('no consulta destinos externos y presenta401 como sesión vencida', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    await expect(readProtectedPdf('https://other.example/document')).rejects.toMatchObject({
      status: 400,
    });
    expect(fetch).not.toHaveBeenCalled();
    await expect(readProtectedPdf(url)).rejects.toMatchObject({ status: 401 });
  });
  it('el retorno de login admite únicamente páginas internas conocidas', () => {
    expect(internalReturnPath('/ventas/' + id)).toBe('/ventas/' + id);
    expect(internalReturnPath('/ventas/' + id + '?guardada=1')).toBe(
      '/ventas/' + id + '?guardada=1',
    );
    expect(internalReturnPath('/ventas/nueva')).toBe('/ventas/nueva');
    for (const value of [
      '//evil.example',
      'https://evil.example',
      '/\\evil.example',
      '/%2f%2fevil.example',
      '/ventas/' + id + '?next=https://evil.example',
      '/api/sales/' + id + '/document',
      '/login',
      ['/inicio'],
      '/inicio\n',
    ])
      expect(internalReturnPath(value)).toBeUndefined();
  });
  it('el service worker nunca sustituye API/PDF por HTML offline', async () => {
    const events = new Map<string, (event: unknown) => void>();
    const match = vi.fn().mockResolvedValue('offline-page');
    const fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const context = vm.createContext({
      self: {
        location: { origin: 'https://qa.example' },
        addEventListener: (name: string, fn: (event: unknown) => void) => events.set(name, fn),
      },
      URL,
      fetch,
      caches: { match },
    });
    vm.runInContext(fs.readFileSync('apps/web/public/sw.js', 'utf8'), context);
    for (const pathname of [
      '/api/sales/' + id + '/delivery-note',
      '/api/sales/' + id + '/document',
      '/api/catalog',
    ]) {
      const respondWith = vi.fn();
      events.get('fetch')!({
        request: { method: 'GET', url: 'https://qa.example' + pathname, mode: 'navigate' },
        respondWith,
      });
      expect(respondWith).not.toHaveBeenCalled();
    }
    expect(match).not.toHaveBeenCalled();
    const respondWith = vi.fn();
    events.get('fetch')!({
      request: { method: 'GET', url: 'https://qa.example/inicio', mode: 'navigate' },
      respondWith,
    });
    expect(await respondWith.mock.calls[0]![0]).toBe('offline-page');
    expect(match).toHaveBeenCalledWith('/offline.html');
  });
});
