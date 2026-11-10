'use client';
import { useState } from 'react';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { ContactRound, Plus, Search, Pencil, ArrowLeft, Download, HandCoins } from 'lucide-react';
import {
  paymentMethodLabel,
  type ClientSummary,
  type ClientAccount,
  type PaymentDetail,
  type PaymentSummary,
  type SaleSummary,
} from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { LoadError, LoadingRows, PageFooter, SavedNotice } from './operations-ui';
import {
  ClientDialog,
  PaymentDialog,
  PaymentSaved,
  PendingPaymentRecovery,
  SaleTable,
} from './commercial-shared';
import { useRemote, displayMoney, displayDate } from '@/lib/inventory-api';
import { useClientDirectory } from '@/lib/use-client-directory';
import { usePagedList } from '@/lib/use-paged-list';
export function ClientsScreen({ session }: { session: AppSession }) {
  const clients = useClientDirectory();
  const query = clients.search;
  const [showInactive, setShowInactive] = useState(false),
    [editing, setEditing] = useState<ClientSummary | null | undefined>(undefined),
    [saved, setSaved] = useState('');
  const rows = (clients.data ?? []).filter((c) => showInactive || c.active);
  const total = (clients.data ?? []).reduce((n, c) => n.plus(c.balanceUsd), new Decimal(0));
  return (
    <AppShell session={session} current="/clientes">
      <main id="app-main" className="main-content operations-page">
        <div className="page-heading">
          <div>
            <h1>Clientes</h1>
            <p>Su contacto, sus comprobantes y el saldo que queda por cobrar.</p>
          </div>
          <Button onClick={() => setEditing(null)}>
            <Plus aria-hidden="true" />
            Nuevo cliente
          </Button>
        </div>
        {saved ? <SavedNotice>{saved}</SavedNotice> : null}
        {clients.error ? (
          <LoadError error={clients.error} retry={() => void clients.reload()} />
        ) : null}
        {clients.loading && !clients.data ? <LoadingRows /> : null}
        {clients.data ? (
          <>
            <div className="commercial-metrics">
              <article>
                <ContactRound aria-hidden="true" />
                <span>Clientes mostrados</span>
                <strong>{clients.data.length}</strong>
                <small>{clients.data.filter((c) => c.active).length} activos</small>
              </article>
              <article>
                <HandCoins aria-hidden="true" />
                <span>Saldo mostrado</span>
                <strong>{displayMoney(total.toFixed(2))}</strong>
                <small>Derivado de comprobantes y abonos</small>
              </article>
            </div>
            <div className="commercial-toolbar">
              <div className="search-field">
                <Search aria-hidden="true" />
                <Input
                  aria-label="Buscar clientes"
                  placeholder="Buscar nombre, teléfono o RIF…"
                  type="search"
                  maxLength={120}
                  value={query}
                  onChange={(e) => clients.setSearch(e.target.value)}
                />
              </div>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                />
                Mostrar inactivos
              </label>
            </div>
            <section className="operations-panel" aria-label="Clientes registrados">
              {rows.length ? (
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Tabla de datos: desplázate para ver todas las columnas"
                >
                  <table className="commercial-table">
                    <caption className="sr-only">Clientes y sus saldos</caption>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>WhatsApp</th>
                        <th>Saldo</th>
                        <th>Estado</th>
                        <th>
                          <span className="sr-only">Editar</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <Link className="row-link" href={'/clientes/' + c.id}>
                              {c.name}
                            </Link>
                            <small>
                              {c.taxId ?? 'Sin identificación'}
                              {c.isDemo ? ' · DEMO' : ''}
                            </small>
                          </td>
                          <td>{c.phone ?? 'Sin teléfono'}</td>
                          <td>
                            <strong>{displayMoney(c.balanceUsd)}</strong>
                          </td>
                          <td>
                            <span className={'status-badge ' + (!c.active ? 'status-neutral' : '')}>
                              {c.active ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>
                          <td>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={'Editar cliente ' + c.name}
                              onClick={() => setEditing(c)}
                            >
                              <Pencil />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="commercial-empty">
                  <ContactRound aria-hidden="true" />
                  <h2>{query ? 'No encontramos coincidencias' : 'Agrega tu primer cliente'}</h2>
                  <p>
                    Elige un cliente al vender para conservar sus comprobantes y registrar cada
                    abono.
                  </p>
                  <Button variant="outline" onClick={() => setEditing(null)}>
                    Crear cliente
                  </Button>
                </div>
              )}
            </section>
            {clients.loading ? <p role="status">Buscando clientes…</p> : null}
            {clients.hasMore ? (
              <Button
                type="button"
                variant="outline"
                disabled={clients.loading}
                onClick={() => void clients.loadMore()}
              >
                Cargar más clientes
              </Button>
            ) : null}
          </>
        ) : null}
        <PageFooter />
      </main>
      {editing !== undefined ? (
        <ClientDialog
          editing={editing ?? undefined}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            setSaved('Cliente guardado.');
            await clients.reload();
          }}
        />
      ) : null}
    </AppShell>
  );
}
export function ClientAccountScreen({ session, id }: { session: AppSession; id: string }) {
  const account = useRemote<ClientAccount>('/api/clients/' + id);
  const sales = usePagedList<SaleSummary>('/api/sales?clientId=' + encodeURIComponent(id));
  const payments = usePagedList<PaymentSummary>('/api/payments?clientId=' + encodeURIComponent(id));
  const reloadAccount = async () => {
    await Promise.all([account.reload(), sales.reload(), payments.reload()]);
  };
  const [paymentSale, setPaymentSale] = useState<string | null | undefined>(undefined),
    [payment, setPayment] = useState<PaymentDetail | null>(null),
    [editing, setEditing] = useState(false);
  return (
    <AppShell session={session} current="/clientes">
      <main id="app-main" className="main-content operations-page">
        <Link href="/clientes" className="back-link">
          <ArrowLeft aria-hidden="true" />
          Clientes
        </Link>
        <PendingPaymentRecovery
          session={session}
          onSaved={async (value) => {
            setPayment(value);
            await reloadAccount();
          }}
        />
        {account.error ? (
          <LoadError error={account.error} retry={() => void account.reload()} />
        ) : null}
        {account.loading && !account.data ? <LoadingRows /> : null}
        {account.data ? (
          <>
            <div className="commercial-detail-heading">
              <div>
                <h1>{account.data.client.name}</h1>
                <p>
                  {account.data.client.phone ?? 'Sin teléfono de WhatsApp'}
                  {account.data.client.isDemo ? ' · DEMO' : ''}
                </p>
              </div>
              <div className="inline-actions">
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden="true" />
                  Editar cliente
                </Button>
                <Button
                  onClick={() => setPaymentSale(null)}
                  disabled={new Decimal(account.data.client.balanceUsd).lte(0)}
                >
                  <Plus aria-hidden="true" />
                  Registrar abono
                </Button>
              </div>
            </div>
            {payment ? <PaymentSaved payment={payment} /> : null}
            <div className="commercial-metrics">
              <article>
                <HandCoins aria-hidden="true" />
                <span>Saldo del cliente</span>
                <strong>{displayMoney(account.data.client.balanceUsd)}</strong>
                <small>Cada pago conserva su aplicación por comprobante</small>
              </article>
              <article>
                <ContactRound aria-hidden="true" />
                <span>Comprobantes mostrados</span>
                <strong>{sales.data?.length ?? 0}</strong>
                <small>
                  {
                    (sales.data ?? []).filter(
                      (s) => s.status === 'confirmed' && new Decimal(s.balanceUsd).gt(0),
                    ).length
                  }{' '}
                  pendientes en esta lista
                </small>
              </article>
            </div>
            <section className="operations-panel">
              <div className="panel-heading">
                <h2>Comprobantes del cliente</h2>
              </div>
              {sales.error ? (
                <LoadError error={sales.error} retry={() => void sales.reload()} />
              ) : null}
              {sales.loading ? <LoadingRows /> : null}
              {sales.data?.length ? (
                <SaleTable sales={sales.data} onPayment={(sale) => setPaymentSale(sale.id)} />
              ) : sales.data && !sales.loading && !sales.error ? (
                <div className="commercial-empty">
                  <p>Este cliente todavía no tiene ventas.</p>
                  <Button asChild variant="outline">
                    <Link href={'/ventas/nueva?cliente=' + account.data.client.id}>
                      Registrar venta
                    </Link>
                  </Button>
                </div>
              ) : null}
              {sales.hasMore ? (
                <Button
                  variant="outline"
                  disabled={sales.loading}
                  onClick={() => void sales.loadMore()}
                >
                  Cargar más comprobantes
                </Button>
              ) : null}
            </section>
            <section className="operations-panel">
              <div className="panel-heading">
                <h2>Historial de abonos</h2>
              </div>
              {payments.error ? (
                <LoadError error={payments.error} retry={() => void payments.reload()} />
              ) : null}
              {payments.loading ? <LoadingRows /> : null}
              {payments.data?.length ? (
                <ul className="commercial-history">
                  {payments.data.map((p) => (
                    <li key={p.id}>
                      <div>
                        <strong>
                          {p.number} · {p.currency} {p.amount}
                        </strong>
                        <small>
                          {displayDate(p.receivedAt)} · {paymentMethodLabel(p.method)}
                          {p.reversed ? ' · Revertido' : ''}
                        </small>
                      </div>
                      <a href={'/api/payments/' + p.id + '/document'} download>
                        <Download aria-hidden="true" />
                        Recibo PDF
                      </a>
                    </li>
                  ))}
                </ul>
              ) : payments.data && !payments.loading && !payments.error ? (
                <p className="inline-explanation">No hay abonos registrados.</p>
              ) : null}
              {payments.hasMore ? (
                <Button
                  variant="outline"
                  disabled={payments.loading}
                  onClick={() => void payments.loadMore()}
                >
                  Cargar más abonos
                </Button>
              ) : null}
            </section>
            {account.data.client.notes ? (
              <p className="commercial-help">{account.data.client.notes}</p>
            ) : null}
          </>
        ) : null}
        <PageFooter />
      </main>
      {account.data && editing ? (
        <ClientDialog
          editing={account.data.client}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await reloadAccount();
          }}
        />
      ) : null}
      {paymentSale !== undefined ? (
        <PaymentDialog
          session={session}
          clientId={id}
          saleId={paymentSale ?? undefined}
          onClose={() => setPaymentSale(undefined)}
          onSaved={async (p) => {
            setPayment(p);
            setPaymentSale(undefined);
            await reloadAccount();
          }}
        />
      ) : null}
    </AppShell>
  );
}
