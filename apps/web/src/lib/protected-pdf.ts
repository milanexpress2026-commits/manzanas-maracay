export class PdfRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function pdfFailure(status: number) {
  if (status === 401)
    return 'Tu sesión venció. Inicia sesión de nuevo y vuelve a abrir el documento.';
  if (status === 403)
    return 'Este acceso no permite abrir el documento. Vuelve a entrar con el acceso del negocio.';
  if (status === 404)
    return 'No se encontró el documento. Vuelve al historial y comprueba el número de venta.';
  return 'El documento no está disponible ahora. Revisa la conexión y vuelve a intentar.';
}

export async function readProtectedPdf(url: string, signal?: AbortSignal): Promise<Blob> {
  if (
    !/^\/api\/sales\/[0-9a-f-]{36}\/(?:delivery-note|document)(?:\?(?:size=(?:letter|a4)(?:&download=1)?|download=1))?$/i.test(
      url,
    )
  )
    throw new PdfRequestError(400, 'La dirección del documento no es válida.');
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
  } catch {
    throw new PdfRequestError(503, pdfFailure(503));
  }
  if (!response.ok) throw new PdfRequestError(response.status, pdfFailure(response.status));
  if (
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/pdf'
  )
    throw new PdfRequestError(
      502,
      'El servidor no devolvió un PDF válido. No se descargó ningún archivo.',
    );
  const bytes = await response.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
    throw new PdfRequestError(
      502,
      'El servidor no devolvió un PDF válido. No se descargó ningún archivo.',
    );
  return new Blob([bytes], { type: 'application/pdf' });
}
