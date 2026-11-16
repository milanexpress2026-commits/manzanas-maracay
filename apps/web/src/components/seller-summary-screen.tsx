'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { businessDate, sellerReportSchema, type SellerReport } from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field, FieldLabel } from './ui/field';
import { FormError, LoadError, LoadingRows } from './operations-ui';
import styles from './sales-partners.module.css';
import { useRemote, displayMoney } from '@/lib/inventory-api';
export function SellerSummaryScreen({ session }: { session: AppSession }) {
  const [today] = useState(() => businessDate());
  const [from, setFrom] = useState(today),
    [to, setTo] = useState(today),
    [error, setError] = useState('');
  const [filter, setFilter] = useState({ from: today, to: today });
  const report = useRemote<SellerReport>(
    `/api/sales/sellers/summary?from=${filter.from}&to=${filter.to}`,
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = sellerReportSchema.safeParse({ from, to });
    if (!parsed.success) {
      setError('Revisa el período: la fecha inicial no puede ser posterior a la final.');
      return;
    }
    setError('');
    setFilter(parsed.data);
    if (from === filter.from && to === filter.to) void report.reload();
  }
  return (
    <AppShell session={session} current="/ventas">
      <main id="app-main" className="main-content operations-page">
        <Link className="back-link" href="/ventas">
          Volver a ventas
        </Link>
        <div className="page-heading">
          <div>
            <h1>Ventas por vendedor</h1>
            <p>Carlos y Randy · fechas de Venezuela.</p>
          </div>
        </div>
        <form onSubmit={submit} className={styles.filters} aria-label="Período del resumen">
          <Field>
            <FieldLabel htmlFor="seller-from">Desde</FieldLabel>
            <Input
              id="seller-from"
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="seller-to">Hasta</FieldLabel>
            <Input
              id="seller-to"
              type="date"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <div className={styles.filterActions}>
            <Button type="submit" disabled={report.loading}>
              Ver resumen
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFrom(today.slice(0, 7) + '-01');
                setTo(today);
                setFilter({ from: today.slice(0, 7) + '-01', to: today });
              }}
            >
              Este mes
            </Button>
          </div>
        </form>
        <FormError message={error} />
        {report.error ? (
          <LoadError error={report.error} retry={() => void report.reload()} />
        ) : null}
        {report.loading ? (
          <LoadingRows />
        ) : !report.error && report.data ? (
          <section className="operations-panel" aria-label="Resumen por vendedor">
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Resumen: desplázate para ver todas las columnas"
            >
              <table className={'commercial-table ' + styles.reportTable}>
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th>Ventas</th>
                    <th>Vendido</th>
                    <th>Cobrado</th>
                    <th>Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.rows.map((row) => (
                    <tr key={row.seller ?? 'previous'}>
                      <th scope="row">
                        {row.seller === 'carlos'
                          ? 'Carlos'
                          : row.seller === 'randy'
                            ? 'Randy'
                            : 'Sin vendedor asignado'}
                      </th>
                      <td>
                        <span className={styles.mobileLabel} aria-hidden="true">
                          Ventas
                        </span>
                        {row.count}
                      </td>
                      <td>
                        <span className={styles.mobileLabel} aria-hidden="true">
                          Vendido
                        </span>
                        {displayMoney(row.totalUsd)}
                      </td>
                      <td>
                        <span className={styles.mobileLabel} aria-hidden="true">
                          Cobrado
                        </span>
                        {displayMoney(row.paidUsd)}
                      </td>
                      <td>
                        <span className={styles.mobileLabel} aria-hidden="true">
                          Pendiente
                        </span>
                        {displayMoney(row.balanceUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.summaryNotes}>
              <p className="commercial-help">
                Incluye las ventas del período con sus productos agregados. Excluye las anuladas.
                Cobrado y pendiente muestran el estado actual de esas ventas.
              </p>
              <p className="commercial-help">
                Las ventas anteriores a esta actualización conservan su historial sin atribuirlas a
                Carlos ni a Randy.
              </p>
            </div>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
