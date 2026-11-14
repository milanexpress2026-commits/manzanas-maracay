export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function decode<T>(response: Response): Promise<T> {
  const body = await response.json().catch((cause: unknown) => {
    if (cause instanceof Error && cause.name === 'AbortError') throw cause;
    if (response.ok) throw new ApiError('La respuesta llegó incompleta. Vuelve a intentar.', 502);
    return {};
  });
  if (!response.ok)
    throw new ApiError(
      response.status === 401
        ? 'Tu sesión terminó. Inicia sesión de nuevo para continuar.'
        : ((typeof body === 'object' &&
          body !== null &&
          'message' in body &&
          typeof body.message === 'string'
            ? body.message
            : null) ??
            'No se pudo completar la operación. Conserva los datos y vuelve a intentar.'),
      response.status,
    );
  return body as T;
}
export async function readApi<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20000);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  try {
    return await decode<T>(
      await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
      }),
    );
  } catch (cause) {
    if (timedOut && !signal?.aborted)
      throw new Error(
        'La consulta está tardando demasiado. Revisa la conexión y pulsa Reintentar.',
      );
    throw cause;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
