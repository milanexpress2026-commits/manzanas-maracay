'use client';
import { useState } from 'react';
import { CalendarDays, HandCoins, CircleAlert } from 'lucide-react';
import type { CollectionsOverview, SaleSummary, PaymentDetail } from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import { LoadError, LoadingRows, PageFooter } from './operations-ui';
import {
  SaleTable,
  PaymentDialog,
  PaymentSaved,
  PendingPaymentRecovery,
  RateNotice,
  type RateStatus,
} from './commercial-shared';
import { CollectionPush } from './collection-push';
import { useRemote, displayMoney } from '@/lib/inventory-api';
import { usePagedList } from '@/lib/use-paged-list';
import { Button } from './ui/button';
export function CollectionsScreen({ session }: { session: AppSession }) {
  const collections = useRemote<CollectionsOverview>('/api/collections'),
    rate = useRemote<RateStatus>('/api/rates/current');
  const [tab, setTab] = useState('today'),
    [selected, setSelected] = useState<SaleSummary | null>(null),
    [payment, setPayment] = useState<PaymentDetail | null>(null);
  const data = collections.data;
  const invoices = usePagedList<SaleSummary>('/api/sales?collection=' + tab);
  const rows = invoices.data ?? [];
  return (
    <AppShell session={session} current="/cobranza">
      <main id="app-main" className="main-content operations-page">
        <div className="page-heading">
          <div>
            <h1>Centro de cobranza</h1>
            <p>Una vista para organizar las llamadas y registrar los abonos del negocio.</p>
          </div>
          <span className="commercial-help">Venezuela · {data?.today ?? 'Consultando fecha…'}</span>
        </div>
        {payment ? <PaymentSaved payment={payment} /> : null}
        <PendingPaymentRecovery
          session={session}
          onSaved={async (value) => {
            setPayment(value);
            await Promise.all([collections.reload(), invoices.reload()]);
          }}
        />
        {collections.error ? (
          <LoadError error={collections.error} retry={() => void collections.reload()} />
        ) : null}
        {collections.loading && !data ? <LoadingRows /> : null}
        {data ? (
          <>
            <div className="commercial-metrics">
              <article>
                <HandCoins aria-hidden="true" />
                <span>Por cobrar</span>
                <strong>{displayMoney(data.totalUsd)}</strong>
                <small>Saldo de comprobantes confirmados</small>
              </article>
              <article>
                <CircleAlert aria-hidden="true" />
                <span>Vencido</span>
                <strong>{displayMoney(data.overdueUsd)}</strong>
                <small>Según fecha pactada, sin cambiar la deuda USD</small>
              </article>
              <article>
                <CalendarDays aria-hidden="true" />
                <span>Para revisar hoy</span>
                <strong>{data.todayCount ?? data.todayInvoices.length}</strong>
                <small>Pagos pactados y recordatorios internos</small>
              </article>
            </div>
            <RateNotice rate={rate.data} />
            <section className="operations-panel">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="catalog-tabs" aria-label="Agenda de cobranza">
                  <TabsTrigger value="today">Hoy</TabsTrigger>
                  <TabsTrigger value="upcoming">Próximas</TabsTrigger>
                  <TabsTrigger value="overdue">Vencidas</TabsTrigger>
                  <TabsTrigger value="all">Todas pendientes</TabsTrigger>
                </TabsList>
                <TabsContent value={tab}>
                  {invoices.error ? (
                    <LoadError error={invoices.error} retry={() => void invoices.reload()} />
                  ) : null}
                  {invoices.loading ? <LoadingRows /> : null}
                  {rows.length ? (
                    <SaleTable sales={rows} onPayment={setSelected} />
                  ) : invoices.data && !invoices.loading && !invoices.error ? (
                    <div className="commercial-empty">
                      <CalendarDays aria-hidden="true" />
                      <h2>No hay comprobantes en esta vista</h2>
                      <p>Los comprobantes pagados dejan de aparecer como pendientes.</p>
                    </div>
                  ) : null}
                  {invoices.hasMore ? (
                    <Button
                      variant="outline"
                      disabled={invoices.loading}
                      onClick={() => void invoices.loadMore()}
                    >
                      Cargar más pendientes
                    </Button>
                  ) : null}
                </TabsContent>
              </Tabs>
            </section>
            <CollectionPush />
          </>
        ) : null}
        <PageFooter />
      </main>
      {selected ? (
        <PaymentDialog
          session={session}
          clientId={selected.clientId}
          saleId={selected.id}
          onClose={() => setSelected(null)}
          onSaved={async (p) => {
            setPayment(p);
            setSelected(null);
            await Promise.all([collections.reload(), invoices.reload()]);
          }}
        />
      ) : null}
    </AppShell>
  );
}
