'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Download, Eye, FileText, LoaderCircle, Plus, Printer } from 'lucide-react';
import { Button } from './ui/button';
import { PdfRequestError, readProtectedPdf } from '@/lib/protected-pdf';
import styles from './sale-document-actions.module.css';

type Intent = 'print' | 'view' | 'download' | 'receipt';
export function SaleDocumentActions({ id, cancelled }: { id: string; cancelled: boolean }) {
  const [size, setSize] = useState<'letter' | 'a4'>('letter');
  const [busy, setBusy] = useState<Intent | null>(null);
  const [error, setError] = useState<PdfRequestError | null>(null);
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState<string | null>(null);
  const [nativeNavigation, setNativeNavigation] = useState(false);
  const intent = useRef<Intent>('print');
  const running = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const objectUrls = useRef<string[]>([]);
  const noteUrl = `/api/sales/${id}/delivery-note?size=${size}`;
  const receiptUrl = `/api/sales/${id}/document`;
  useEffect(() => {
    // Installed apps and Android hand HTTPS documents to the browser/system
    // viewer. A blob URL belongs to the app's renderer and is not a portable
    // document address for that handoff. The same protected proxy validates it.
    setNativeNavigation(
      /Android/i.test(navigator.userAgent) ||
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    );
  }, []);
  useEffect(
    () => () => {
      abort.current?.abort();
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  async function openDocument(action: Intent, event?: MouseEvent<HTMLAnchorElement>) {
    if (
      event &&
      (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)
    )
      return;
    event?.preventDefault();
    if (running.current) return;
    running.current = true;
    intent.current = action;
    setBusy(action);
    setError(null);
    setMessage('');
    setFallback(null);
    let viewer: Window | null = null;
    // Open only during the user's gesture. Never print the application's HTML.
    if (action === 'print') {
      try {
        viewer = window.open('about:blank', '_blank');
        if (viewer) {
          viewer.opener = null;
          viewer.document.title = 'Preparando nota de entrega';
          viewer.document.body.textContent = 'Preparando el PDF de la nota de entrega…';
        }
      } catch {
        try {
          viewer?.close();
        } catch {}
        viewer = null;
      }
    }
    abort.current = new AbortController();
    try {
      const url =
        action === 'receipt' ? receiptUrl : noteUrl + (action === 'download' ? '&download=1' : '');
      const pdf = await readProtectedPdf(url, abort.current.signal);
      if (abort.current.signal.aborted) {
        viewer?.close();
        return;
      }
      const objectUrl = URL.createObjectURL(pdf);
      objectUrls.current.push(objectUrl);
      if (action === 'download' || action === 'receipt') {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = `${action === 'receipt' ? 'comprobante' : 'nota-entrega'}-${id}.pdf`;
        document.body.append(link);
        link.click();
        link.remove();
        setMessage('PDF preparado. Revisa las descargas de tu dispositivo.');
      } else if (action === 'view') {
        window.location.assign(objectUrl);
      } else if (viewer && !viewer.closed) {
        viewer.location.replace(objectUrl);
        setMessage('El PDF está listo en el visor. Elige Imprimir y selecciona tu impresora.');
      } else {
        setFallback(objectUrl);
        setMessage('El navegador no abrió otra pestaña. Puedes ver la nota aquí o descargarla.');
      }
    } catch (reason) {
      try {
        viewer?.close();
      } catch {}
      if (!abort.current?.signal.aborted) {
        if (!(reason instanceof PdfRequestError))
          setFallback(action === 'receipt' ? receiptUrl : noteUrl);
        setError(
          reason instanceof PdfRequestError
            ? reason
            : new PdfRequestError(
                503,
                'No se pudo abrir el visor. Prueba el enlace directo al documento.',
              ),
        );
      }
    } finally {
      running.current = false;
      setBusy(null);
    }
  }
  return (
    <section className={styles.actions} aria-label="Documentos de la venta" aria-busy={!!busy}>
      <div className={styles.primary}>
        {nativeNavigation ? (
          <Button asChild>
            <a href={noteUrl} target="_blank" rel="noopener noreferrer">
              <Printer aria-hidden="true" />
              Imprimir nota
            </a>
          </Button>
        ) : (
          <Button disabled={!!busy} onClick={() => void openDocument('print')}>
            {busy === 'print' ? (
              <LoaderCircle aria-hidden="true" />
            ) : (
              <Printer aria-hidden="true" />
            )}
            {busy === 'print' ? 'Preparando nota…' : 'Imprimir nota'}
          </Button>
        )}
        <Button variant="outline" asChild>
          <Link href="/ventas/nueva">
            <Plus aria-hidden="true" />
            Nueva venta
          </Link>
        </Button>
      </div>
      <div className={styles.secondary}>
        <Button variant="outline" asChild>
          <a
            href={noteUrl}
            target={nativeNavigation ? '_blank' : undefined}
            rel={nativeNavigation ? 'noopener noreferrer' : undefined}
            aria-disabled={!!busy}
            onClick={nativeNavigation ? undefined : (event) => void openDocument('view', event)}
          >
            <Eye aria-hidden="true" />
            Ver nota de entrega
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a
            href={noteUrl + '&download=1'}
            download={nativeNavigation ? undefined : true}
            target={nativeNavigation ? '_blank' : undefined}
            rel={nativeNavigation ? 'noopener noreferrer' : undefined}
            aria-disabled={!!busy}
            onClick={nativeNavigation ? undefined : (event) => void openDocument('download', event)}
          >
            <Download aria-hidden="true" />
            Descargar nota
          </a>
        </Button>
      </div>
      {cancelled ? (
        <p className={styles.cancelled}>
          Venta anulada. La nota es una copia histórica: no entregar mercancía.
        </p>
      ) : null}
      <p className={styles.help}>
        Abre el visor PDF y elige Imprimir. Si la impresora no está disponible, descarga la nota
        para imprimirla después. La venta ya está guardada.
      </p>
      <details className={styles.options}>
        <summary>Comprobante y tamaño de papel</summary>
        <div>
          <label htmlFor="delivery-paper">Tamaño de la nota</label>
          <select
            id="delivery-paper"
            value={size}
            disabled={!!busy}
            onChange={(event) => setSize(event.target.value as 'letter' | 'a4')}
          >
            <option value="letter">Carta · 8,5 × 11 pulgadas</option>
            <option value="a4">A4</option>
          </select>
          <Button variant="outline" asChild>
            <a
              href={receiptUrl}
              download={nativeNavigation ? undefined : true}
              target={nativeNavigation ? '_blank' : undefined}
              rel={nativeNavigation ? 'noopener noreferrer' : undefined}
              aria-disabled={!!busy}
              onClick={
                nativeNavigation ? undefined : (event) => void openDocument('receipt', event)
              }
            >
              <FileText aria-hidden="true" />
              Descargar comprobante de venta
            </a>
          </Button>
        </div>
      </details>
      {message ? (
        <p className={styles.message} role="status">
          {message}
        </p>
      ) : null}
      {fallback ? (
        <a className={styles.fallback} href={fallback}>
          {fallback.startsWith('blob:')
            ? 'Ver nota en esta pestaña'
            : 'Abrir documento directamente'}
        </a>
      ) : null}
      {error ? (
        <div className={styles.error} role="alert">
          <strong>No se pudo abrir el documento</strong>
          <p>{error.message}</p>
          <p>La venta permanece guardada. No vuelvas a registrarla ni a cobrarla.</p>
          {error.status === 401 || error.status === 403 ? (
            <Link href={'/login?returnTo=' + encodeURIComponent('/ventas/' + id)}>
              Iniciar sesión y volver a esta venta
            </Link>
          ) : (
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => void openDocument(intent.current)}
            >
              Reintentar documento
            </Button>
          )}
        </div>
      ) : null}
    </section>
  );
}
