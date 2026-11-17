'use client';
import Link from 'next/link';
import Decimal from 'decimal.js';
import type { SaleDetail } from '@mm/domain';
import { saleAdditionCommandSchema } from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { NewSaleScreen } from './sales-screen';
import { LoadError, LoadingRows } from './operations-ui';
import { useRemote, useDurableCommercialCommand } from '@/lib/inventory-api';
import { commercialCommandBody } from '@/lib/commercial-journal';
export function SaleAdditionScreen({ session, id }: { session: AppSession; id: string }) {
  const detail = useRemote<SaleDetail>('/api/sales/' + id);
  const command = useDurableCommercialCommand(
    session.environment + ':' + (session.operationScopeId ?? session.user.id),
    'sale-addition',
  );
  const pending = command.pending
    ? saleAdditionCommandSchema.parse(commercialCommandBody(command.pending))
    : null;
  const sale = detail.data;
  // A committed request can leave a paid sale: recovery takes priority over current eligibility.
  const blocked =
    sale?.status === 'cancelled' ||
    (sale?.condition === 'cash' && new Decimal(sale.balanceUsd).gt(0));
  if (
    sale &&
    command.ready &&
    (!pending || pending.saleId === id) &&
    (!blocked || pending?.saleId === id)
  )
    return <NewSaleScreen session={session} additionSale={sale} />;
  return (
    <AppShell session={session} current="/ventas">
      <main id="app-main" className="main-content operations-page">
        <Link className="back-link" href={'/ventas/' + id}>
          Volver a la venta
        </Link>
        <h1>Agregar productos</h1>
        {detail.error ? (
          <LoadError error={detail.error} retry={() => void detail.reload()} />
        ) : null}
        {command.storageError ? <p role="alert">{command.storageError}</p> : null}
        {!sale || !command.ready ? (
          <LoadingRows />
        ) : pending && pending.saleId !== id ? (
          <p>
            Hay productos pendientes de confirmación en otra venta.{' '}
            <Link href={'/ventas/' + pending.saleId + '/editar'}>Recuperar esa operación</Link>
          </p>
        ) : (
          <p>
            {sale.status === 'cancelled'
              ? 'Esta venta está anulada.'
              : sale.condition === 'credit'
                ? 'Esta venta a crédito ya tiene abonos y se conserva sin cambios.'
                : 'Esta venta de contado tiene un cobro por resolver.'}{' '}
            <Link href={'/ventas/nueva?cliente=' + sale.clientId}>
              Registrar productos en una venta nueva
            </Link>
          </p>
        )}
      </main>
    </AppShell>
  );
}
