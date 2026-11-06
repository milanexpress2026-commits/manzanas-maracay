export const privateHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function privateJson(message: string, status: number) {
  return Response.json({ message }, { status, headers: privateHeaders });
}

/** Never let HTML, a login redirect or an error body become a downloaded PDF. */
export async function pdfProxyResponse(
  response: Response,
  fallbackFilename: string,
): Promise<Response> {
  if (!response.ok) {
    const status = [400, 401, 403, 404, 409, 429, 503].includes(response.status)
      ? response.status
      : 502;
    const messages: Record<number, string> = {
      400: 'Revisa las opciones del documento.',
      401: 'Inicia sesión para abrir el documento.',
      403: 'No tienes acceso a este documento.',
      404: 'No se encontró el documento.',
      429: 'Espera un momento antes de volver a abrir el documento.',
    };
    const result = privateJson(
      messages[status] ?? 'No se pudo obtener el documento. Vuelve a intentar.',
      status,
    );
    if (status === 429) result.headers.set('Retry-After', '60');
    return result;
  }
  if (
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/pdf'
  )
    return privateJson('El servidor no devolvió un PDF válido.', 502);
  const bytes = await response.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
    return privateJson('El servidor no devolvió un PDF válido.', 502);
  const disposition = response.headers.get('content-disposition') ?? '';
  const safeDisposition = /^(inline|attachment); filename="[a-zA-Z0-9._-]{1,150}\.pdf"$/.test(
    disposition,
  )
    ? disposition
    : `attachment; filename="${/^[a-zA-Z0-9._-]+\.pdf$/.test(fallbackFilename) ? fallbackFilename : 'documento.pdf'}"`;
  return new Response(bytes, {
    status: 200,
    headers: {
      ...privateHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': safeDisposition,
    },
  });
}
