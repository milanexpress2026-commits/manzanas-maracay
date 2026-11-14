'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, ShoppingCart } from 'lucide-react';
import type { SaleSummary } from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { LoadError, LoadingRows, PageFooter, FormError } from './operations-ui';
import { SaleTable } from './sale-table';
import { useDurableCommercialCommand } from '@/lib/inventory-api';
import { usePagedList } from '@/lib/use-paged-list';
export function SalesScreen({
  session,
  initialRows,
  initialReadAt,
}: {
  session: AppSession;
  initialRows?: SaleSummary[] | null;
  initialReadAt?: number;
}) {
  const [query, setQuery] = useState('');
  const sales = usePagedList<SaleSummary>(
    '/api/sales?search=' + encodeURIComponent(query.trim()),
    25,
    initialRows,
    initialReadAt,
  );
  const pendingSale = useDurableCommercialCommand(
    session.environment + ':' + (session.operationScopeId ?? session.user.id),
    'sale',
  );
  const rows = sales.data ?? [];
  return (
    <AppShell session={session} current="/ventas">
      <main id="app-main" className="main-content operations-page">
        <div className="page-heading">
          <div>
            <h1>Ventas</h1>
            <p>La mercancía entregada, el precio pactado y cada saldo pendiente.</p>
          </div>
          <Button asChild>
            <Link prefetch={false} href="/ventas/nueva">
              <Plus aria-hidden="true" />
              Nueva venta
            </Link>
          </Button>
        </div>
        <FormError message={pendingSale.storageError} />
        {pendingSale.pending ? (
          <section className="saved-notice" aria-label="Venta pendiente de confirmación">
            <p>Hay una venta pendiente de confirmación en este dispositivo.</p>
            <Button asChild variant="outline">
              <Link prefetch={false} href="/ventas/nueva">
                Recuperar venta pendiente
              </Link>
            </Button>
          </section>
        ) : null}
        <div className="commercial-toolbar">
          <div className="search-field">
            <Search aria-hidden="true" />
            <Input
              aria-label="Buscar ventas"
              maxLength={120}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar comprobante o cliente…"
            />
          </div>
        </div>
        {sales.error ? <LoadError error={sales.error} retry={() => void sales.reload()} /> : null}
        {sales.loading && !sales.data ? <LoadingRows /> : null}
        {sales.loading && sales.data ? <p role="status">Actualizando ventas…</p> : null}
        {sales.data ? (
          <>
            <section className="operations-panel" aria-label="Ventas registradas">
              {rows.length ? (
                <SaleTable sales={rows} />
              ) : (
                <div className="commercial-empty">
                  <ShoppingCart aria-hidden="true" />
                  <h2>{query ? 'No encontramos coincidencias' : 'Registra la primera venta'}</h2>
                  <p>Selecciona cliente y productos e indica el precio de esta venta.</p>
                  <Button asChild variant="outline">
                    <Link prefetch={false} href="/ventas/nueva">
                      Registrar venta
                    </Link>
                  </Button>
                </div>
              )}
            </section>
            {sales.hasMore ? (
              <Button
                variant="outline"
                disabled={sales.loading}
                onClick={() => void sales.loadMore()}
              >
                Cargar más ventas
              </Button>
            ) : null}
          </>
        ) : null}
        <PageFooter />
      </main>
    </AppShell>
  );
}
