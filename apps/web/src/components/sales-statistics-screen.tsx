'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { businessDate } from '@mm/domain';
import { statisticsFilterSchema, type StatisticsFilter, type SalesStatistics } from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field, FieldLabel } from './ui/field';
import { FormError, LoadError, LoadingRows } from './operations-ui';
import { useRemote, displayMoney } from '@/lib/inventory-api';
import styles from './sales-statistics.module.css';

const sellers = {
  all: 'Todos',
  carlos: 'Carlos',
  randy: 'Randy',
  unassigned: 'Sin asignar',
} as const;
const groups = { products: 'Productos', clients: 'Clientes', sales: 'Ventas' } as const;
const dateFormat = new Intl.DateTimeFormat('es-VE', {
  timeZone: 'America/Caracas',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const quantityFormat = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 4 });
function boxes(value: string) {
  const exact = new Decimal(value),
    rounded = exact.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  return (exact.eq(rounded) ? '' : '≈ ') + quantityFormat.format(rounded.toNumber());
}
export function SalesStatisticsScreen({ session }: { session: AppSession }) {
  const [today] = useState(() => businessDate());
  const [from, setFrom] = useState(today),
    [to, setTo] = useState(today);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<StatisticsFilter>({
    from: today,
    to: today,
    seller: 'all',
    group: 'products',
    page: 0,
  });
  const [detailLabel, setDetailLabel] = useState('');
  const query = new URLSearchParams(
    Object.entries(filter).map(([key, value]) => [key, String(value)]),
  );
  const report = useRemote<SalesStatistics>('/api/sales/statistics?' + query);
  const data = report.data;
  function change(next: Partial<StatisticsFilter>) {
    setFilter((previous) => ({ ...previous, ...next, page: next.page ?? 0 }));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = statisticsFilterSchema.safeParse({ ...filter, from, to, page: 0 });
    if (!parsed.success) {
      setError('Revisa las fechas: Desde debe ser anterior o igual a Hasta.');
      return;
    }
    setError('');
    if (JSON.stringify(parsed.data) === JSON.stringify(filter)) void report.reload();
    else setFilter(parsed.data);
  }
  function period(start: string) {
    setFrom(start);
    setTo(today);
    setError('');
    change({ from: start, to: today });
    if (filter.from === start && filter.to === today) void report.reload();
  }
  const activeName = sellers[filter.seller];
  return (
    <AppShell session={session} current="/estadisticas">
      <main id="app-main" className="main-content operations-page">
        <div className="page-heading">
          <div>
            <h1>Estadísticas</h1>
            <p>Qué vendimos, cuántas cajas y a quién.</p>
          </div>
          <Link prefetch={false} href="/ventas" className="back-link">
            Ir a ventas
          </Link>
        </div>
        <section className={styles.controls} aria-label="Filtros de estadísticas">
          <div className={styles.choices} role="group" aria-label="Vendedor">
            {(Object.keys(sellers) as StatisticsFilter['seller'][]).map((seller) => (
              <Button
                key={seller}
                variant={filter.seller === seller ? 'default' : 'outline'}
                aria-pressed={filter.seller === seller}
                onClick={() => change({ seller })}
              >
                {sellers[seller]}
              </Button>
            ))}
          </div>
          <form onSubmit={submit} className={styles.dates}>
            <Field>
              <FieldLabel htmlFor="statistics-from">Desde</FieldLabel>
              <Input
                id="statistics-from"
                type="date"
                required
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="statistics-to">Hasta</FieldLabel>
              <Input
                id="statistics-to"
                type="date"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={report.loading}>
              Ver estadísticas
            </Button>
            <div className={styles.choices} aria-label="Períodos rápidos">
              <Button type="button" variant="outline" onClick={() => period(today)}>
                Hoy
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => period(today.slice(0, 7) + '-01')}
              >
                Este mes
              </Button>
            </div>
          </form>
          <FormError message={error} />
        </section>
        <div className={styles.resultsHeading}>
          <h2>{activeName === 'Todos' ? 'Ventas del negocio' : 'Ventas de ' + activeName}</h2>
          <p>
            {dateFormat.format(new Date(filter.from + 'T12:00:00-04:00'))} —{' '}
            {dateFormat.format(new Date(filter.to + 'T12:00:00-04:00'))}
          </p>
        </div>
        {detailLabel ? (
          <div className={styles.detailFilter}>
            <span>Mostrando: {detailLabel}</span>
            <Button
              variant="outline"
              onClick={() => {
                setDetailLabel('');
                setFilter(({ variantId: _variantId, clientId: _clientId, ...previous }) => ({
                  ...previous,
                  page: 0,
                }));
              }}
            >
              Quitar filtro
            </Button>
          </div>
        ) : null}
        {report.error ? (
          <LoadError error={report.error} retry={() => void report.reload()} />
        ) : null}
        {report.loading ? (
          <LoadingRows />
        ) : !report.error && data ? (
          <>
            <section className={styles.totals} aria-label="Totales del período" aria-live="polite">
              <div className={styles.boxTotal}>
                <span>Total de cajas vendidas</span>
                <strong>
                  {boxes(data.totals.boxes)} <span>cajas</span>
                </strong>
              </div>
              <dl>
                <div>
                  <dt>Vendido</dt>
                  <dd>{displayMoney(data.totals.totalUsd)}</dd>
                </div>
                <div>
                  <dt>Ventas</dt>
                  <dd>{data.totals.saleCount}</dd>
                </div>
                <div>
                  <dt>Clientes</dt>
                  <dd>{data.totals.clientCount}</dd>
                </div>
              </dl>
            </section>
            <p className={styles.explanation}>
              Medias y blísteres sumados en cajas según el empaque de la venta. Devoluciones
              descontadas y ventas anuladas excluidas.
            </p>
            {data.totals.unknownLines > 0 ? (
              <p role="status" className={styles.warning}>
                El total de cajas es parcial: {data.totals.unknownLines} líneas no tienen una
                equivalencia verificable. Sus importes sí están incluidos.
              </p>
            ) : null}
            {filter.seller === 'all' && data.sellers.some((row) => row.seller === null) ? (
              <p className={styles.explanation}>
                El total incluye ventas antiguas sin vendedor asignado.
              </p>
            ) : null}
            <section
              className={'operations-panel ' + styles.detail}
              aria-label="Detalle de estadísticas"
            >
              <div className={styles.detailHeading}>
                <h2>Detalle de lo vendido</h2>
                <div className={styles.choices} role="group" aria-label="Ver detalle por">
                  {(Object.keys(groups) as StatisticsFilter['group'][]).map((group) => (
                    <Button
                      key={group}
                      variant={filter.group === group ? 'default' : 'outline'}
                      aria-pressed={filter.group === group}
                      onClick={() => change({ group })}
                    >
                      {groups[group]}
                    </Button>
                  ))}
                </div>
              </div>
              {data.rows.length ? (
                <table className={'commercial-table ' + styles.table}>
                  <caption className="sr-only">
                    {groups[filter.group]} vendidos por {activeName}
                  </caption>
                  <thead>
                    <tr>
                      <th>{filter.group === 'clients' ? 'Cliente' : 'Producto / variedad'}</th>
                      {filter.group === 'sales' ? <th>Cliente y venta</th> : null}
                      <th>Cajas</th>
                      <th>Vendido</th>
                      <th>
                        <span className="sr-only">Abrir detalle</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.key}>
                        <th scope="row">
                          {filter.group === 'clients' ? row.clientName : row.description}
                          {filter.group !== 'sales' ? (
                            <small>
                              {row.saleCount} {row.saleCount === 1 ? 'venta' : 'ventas'}
                            </small>
                          ) : null}
                        </th>
                        {filter.group === 'sales' ? (
                          <td className={styles.customer}>
                            <strong>{row.clientName}</strong>
                            <span>
                              {row.number} ·{' '}
                              {row.seller === 'carlos'
                                ? 'Carlos'
                                : row.seller === 'randy'
                                  ? 'Randy'
                                  : 'Sin asignar'}
                            </span>
                            <span>{dateFormat.format(new Date(row.soldAt!))}</span>
                          </td>
                        ) : null}
                        <td>
                          <span className={styles.mobileLabel}>Cajas</span>
                          <strong>
                            {boxes(row.boxes)}
                            {row.unknownLines ? ' *' : ''}
                          </strong>
                        </td>
                        <td>
                          <span className={styles.mobileLabel}>Vendido</span>
                          {displayMoney(row.totalUsd)}
                        </td>
                        <td className={styles.rowAction}>
                          {filter.group === 'sales' ? (
                            <Link
                              prefetch={false}
                              className="back-link"
                              href={'/ventas/' + row.saleId}
                            >
                              Ver venta
                            </Link>
                          ) : (
                            <Button
                              variant="outline"
                              onClick={() => {
                                change({
                                  group: 'sales',
                                  ...(filter.group === 'products'
                                    ? { variantId: row.variantId! }
                                    : { clientId: row.clientId! }),
                                });
                                setDetailLabel(
                                  [
                                    detailLabel,
                                    filter.group === 'products' ? row.description : row.clientName,
                                  ]
                                    .filter(Boolean)
                                    .join(' · '),
                                );
                              }}
                            >
                              Ver ventas
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={styles.empty}>
                  <h3>No hay ventas en esta selección</h3>
                  <p>
                    Elige otro período o vendedor. Las ventas anuladas y los productos devueltos no
                    se cuentan.
                  </p>
                </div>
              )}
              {data.rowCount > data.pageSize ? (
                <div className={styles.pagination}>
                  <Button
                    variant="outline"
                    disabled={filter.page === 0}
                    onClick={() => change({ page: filter.page - 1 })}
                  >
                    Anterior
                  </Button>
                  <span>
                    Página {filter.page + 1} de {Math.ceil(data.rowCount / data.pageSize)}
                  </span>
                  <Button
                    variant="outline"
                    disabled={(filter.page + 1) * data.pageSize >= data.rowCount}
                    onClick={() => change({ page: filter.page + 1 })}
                  >
                    Siguiente
                  </Button>
                </div>
              ) : null}
            </section>
            <p className={styles.explanation}>
              Se usa la fecha original de la venta en Venezuela y sus cantidades actuales. «≈»
              indica redondeo a cuatro decimales.{' '}
              <Link prefetch={false} href="/ventas/resumen">
                Ver cobros y saldos por vendedor
              </Link>
            </p>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
