'use client';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { HandCoins } from 'lucide-react';
import type { SaleSummary } from '@mm/domain';
import { Button } from './ui/button';
import { displayDate, displayMoney } from '@/lib/inventory-api';
export function DueBadge({ sale }: { sale: SaleSummary }) {
  const value = sale.status === 'cancelled' ? 'cancelled' : sale.dueStatus;
  const labels = {
    paid: 'Pagada',
    overdue: 'Vencida',
    due_soon: 'Por vencer',
    pending: 'Pendiente',
    cancelled: 'Anulada',
  };
  return (
    <span
      className={
        'status-badge ' +
        (value === 'overdue'
          ? 'status-danger'
          : value === 'pending' || value === 'due_soon'
            ? 'status-pending'
            : value === 'cancelled'
              ? 'status-neutral'
              : '')
      }
    >
      {labels[value]}
    </span>
  );
}
export function SaleTable({
  sales,
  onPayment,
}: {
  sales: SaleSummary[];
  onPayment?: (sale: SaleSummary) => void;
}) {
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Tabla de datos: desplázate para ver todas las columnas"
    >
      <table className="commercial-table">
        <caption className="sr-only">Comprobantes de venta y saldo individual</caption>
        <thead>
          <tr>
            <th>Comprobante / cliente</th>
            <th>Fecha</th>
            <th>Total USD</th>
            <th>Saldo USD</th>
            <th>Estado</th>
            <th>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id}>
              <td>
                <Link prefetch={false} className="row-link" href={'/ventas/' + s.id}>
                  {s.number}
                </Link>
                <small>
                  {s.clientName}
                  {s.isDemo ? ' · DEMO' : ''}
                </small>
              </td>
              <td>{displayDate(s.soldAt)}</td>
              <td>{displayMoney(s.totalUsd)}</td>
              <td>
                <strong>{displayMoney(s.balanceUsd)}</strong>
                <small>{s.dueDate ? 'Pago pactado: ' + s.dueDate : 'Sin fecha pactada'}</small>
              </td>
              <td>
                <DueBadge sale={s} />
              </td>
              <td>
                {onPayment && s.status === 'confirmed' && new Decimal(s.balanceUsd).gt(0) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPayment(s)}
                    aria-label={'Registrar abono a ' + s.number}
                  >
                    <HandCoins aria-hidden="true" />
                    Abonar
                  </Button>
                ) : (
                  <Link prefetch={false} href={'/ventas/' + s.id}>
                    Ver detalle
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
