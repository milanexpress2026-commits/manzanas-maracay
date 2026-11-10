'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, LoaderCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
export function LoadError({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>No se pudo completar la consulta</AlertTitle>
      <AlertDescription>
        <p>{error}</p>
        <div className="inline-actions">
          {retry ? (
            <Button variant="outline" size="sm" onClick={retry}>
              <RefreshCw data-icon="inline-start" />
              Reintentar
            </Button>
          ) : null}
          {error.includes('sesión') ? <a href="/login">Iniciar sesión</a> : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
export function FormError({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message) ref.current?.focus();
  }, [message]);
  if (!message) return null;
  return (
    <Alert ref={ref} tabIndex={-1} variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertDescription>
        {message}
        {message.includes('sesión') ? <a href="/login"> Iniciar sesión</a> : null}
      </AlertDescription>
    </Alert>
  );
}
export function SavedNotice({ children }: { children: ReactNode }) {
  return (
    <div className="saved-notice" role="status">
      <CheckCircle2 aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
export function LoadingRows() {
  return (
    <div className="operation-loading" aria-label="Cargando registros" role="status">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <span className="sr-only">Cargando registros…</span>
    </div>
  );
}
export function SaveButton({
  busy,
  disabled = false,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button type="submit" disabled={busy || disabled}>
      {busy ? <LoaderCircle className="spin" data-icon="inline-start" /> : null}
      {busy ? 'Guardando…' : children}
    </Button>
  );
}
export function PageFooter() {
  return (
    <footer className="page-footer">
      <span>Manzanas Maracay · Frutas importadas</span>
      <span>Gestión comercial</span>
    </footer>
  );
}
