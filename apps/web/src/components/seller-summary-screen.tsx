'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Package } from 'lucide-react';
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
  const [seller, setSeller] = useState<'carlos' | 'randy' | null>('carlos');
  const report = useRemote<SellerReport>(
    `/api/sales/sellers/summary?from=${filter.from}&to=${filter.to}`,
  );
  const selected = report.data?.rows.find((row) => row.seller === seller);
  const sellerName =
    seller === 'carlos' ? 'Carlos' : seller === 'randy' ? 'Randy' : 'Sin vendedor asignado';
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
          <a className="back-link" href="#merchandise-title">
            Ver mercancía vendida
          </a>
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
                setError('');
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
          <>
            <section className="operations-panel" aria-label="Resumen por vendedor">
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Resumen: desplázate para ver todas las columnas"
              >
                <table className={'commercial-table ' + styles.reportTable}>
                  <caption className="sr-only">Importes por vendedor</caption>
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
                  Las ventas anteriores a esta actualización conservan su historial sin atribuirlas
                  a Carlos ni a Randy.
                </p>
              </div>
            </section>
            <section
              className={'operations-panel ' + styles.merchandise}
              aria-labelledby="merchandise-title"
            >
              <div className="panel-heading">
                <Package aria-hidden="true" />
                <h2 id="merchandise-title" tabIndex={-1}>
                  Mercancía vendida
                </h2>
              </div>
              <div className={styles.merchandiseControls}>
                <p>Elige un vendedor para ver los productos que entregó en este período.</p>
                <div
                  className={styles.sellerChoices}
                  role="group"
                  aria-label="Vendedor de la mercancía"
                >
                  {(['carlos', 'randy', null] as const).map((value) => (
                    <Button
                      key={value ?? 'previous'}
                      type="button"
                      variant={seller === value ? 'default' : 'outline'}
                      aria-pressed={seller === value}
                      onClick={() => setSeller(value)}
                    >
                      {value === 'carlos' ? 'Carlos' : value === 'randy' ? 'Randy' : 'Sin asignar'}
                    </Button>
                  ))}
                </div>
              </div>
              <div aria-live="polite" aria-atomic="true" className={styles.merchandiseHeading}>
                <h3>{sellerName}</h3>
                <p>
                  {selected?.count ?? 0} ventas · {displayMoney(selected?.totalUsd ?? '0')} vendido
                </p>
              </div>
              {selected?.merchandise.length ? (
                <div className={styles.merchandiseList}>
                  <table className={'commercial-table ' + styles.merchandiseTable}>
                    <caption className="sr-only">Productos vendidos por {sellerName}</caption>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Presentación</th>
                        <th>Cantidad</th>
                        <th>Vendido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.merchandise.map((item) => (
                        <tr
                          key={[
                            item.variantId,
                            item.description,
                            item.presentation,
                            item.commercialUnitLabel,
                          ].join('|')}
                        >
                          <th scope="row">{item.description}</th>
                          <td>
                            {item.presentation === 'half_box'
                              ? 'Media caja'
                              : item.presentation === 'blister'
                                ? 'Blíster'
                                : (item.commercialUnitLabel ?? 'Caja')}
                          </td>
                          <td>
                            <span className={styles.mobileLabel} aria-hidden="true">
                              Cantidad
                            </span>
                            <strong>{item.quantity}</strong>
                          </td>
                          <td>
                            <span className={styles.mobileLabel} aria-hidden="true">
                              Vendido
                            </span>
                            {displayMoney(item.totalUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.merchandiseEmpty}>
                  No hay mercancía vendida por {sellerName} en estas fechas. Puedes elegir otro
                  vendedor o cambiar el período.
                </p>
              )}
              <p className={styles.merchandiseFootnote}>
                Cada presentación se cuenta por separado: 1 media caja equivale a media caja, no a
                una caja completa. No se incluyen ventas anuladas.
              </p>
            </section>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
