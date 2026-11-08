'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Circle,
  HandCoins,
  ShoppingCart,
  Truck,
  RefreshCw,
} from 'lucide-react';
import type { OperationsOverview } from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Button } from './ui/button';
import { LoadError, LoadingRows, PageFooter } from './operations-ui';
import { RateNotice, useCurrentRates } from './commercial-shared';
import { useRemote, displayMoney } from '@/lib/inventory-api';

export function OperationsHome({ session }: { session: AppSession }) {
  const overview = useRemote<OperationsOverview>('/api/operations/overview');
  const rate = useCurrentRates();
  const [date, setDate] = useState('');
  useEffect(
    () =>
      setDate(
        new Intl.DateTimeFormat('es-VE', { dateStyle: 'long', timeZone: 'America/Caracas' }).format(
          new Date(),
        ),
      ),
    [],
  );
  const data = overview.data;
  const steps = data
    ? [
        {
          title: 'Recibe la mercancía',
          description:
            'Elige los productos habituales, indica la cantidad y confirma la recepción.',
          href: '/recepciones',
          action: 'Registrar recepción',
          done: data.counts.receipts > 0,
        },
        {
          title: 'Registra el cliente',
          description: 'El teléfono internacional permite abrir la cobranza manual por WhatsApp.',
          href: '/clientes',
          action: 'Ir a clientes',
          done: data.counts.clients > 0,
        },
        {
          title: 'Registra la primera venta',
          description:
            'Elige productos, precio pactado y pago o crédito. Revisa antes de confirmar.',
          href: '/ventas/nueva',
          action: 'Crear venta',
          done: data.counts.sales > 0,
        },
      ]
    : [];
  const pending = steps.find((step) => !step.done);
  return (
    <AppShell session={session} current="/inicio">
      <main id="app-main" className="main-content operations-page operations-home">
        <div className="page-heading">
          <div>
            <h1>Tu negocio, al día</h1>
            <p>
              {date ? `${date} · Hora de Venezuela` : 'Mercancía, ventas y cuentas por cobrar.'}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void overview.reload();
              void rate.reload();
            }}
            disabled={overview.loading}
            aria-label="Actualizar resumen"
          >
            <RefreshCw aria-hidden="true" />
            Actualizar
          </Button>
        </div>
        {overview.error ? (
          <LoadError error={overview.error} retry={() => void overview.reload()} />
        ) : null}
        {overview.loading && !data ? <LoadingRows /> : null}
        {data && !overview.error ? (
          <>
            <section className="operation-overview" aria-label="Resumen de la operación">
              <dl>
                <div>
                  <dt>
                    <Boxes aria-hidden="true" />
                    Cajas cerradas disponibles
                  </dt>
                  <dd>
                    <span className="operation-overview-value">{data.inventory.sealedBoxes}</span>
                    <Link href="/inventario">
                      Consultar inventario
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>
                    <HandCoins aria-hidden="true" />
                    Saldo por cobrar
                  </dt>
                  <dd>
                    <span className="operation-overview-value">
                      {displayMoney(data.receivablesUsd)}
                    </span>
                    <Link href="/cobranza">
                      Revisar cobranza
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt>
                    <ShoppingCart aria-hidden="true" />
                    Ventas vigentes
                  </dt>
                  <dd>
                    <span className="operation-overview-value">{data.counts.sales}</span>
                    <Link href="/ventas">
                      Ver comprobantes
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </dd>
                </div>
              </dl>
            </section>
            <div className="operation-home-layout">
              <section
                className="operations-panel operation-start"
                aria-labelledby="operation-start-title"
              >
                <h2 id="operation-start-title">
                  {pending ? 'Prepara tu primera operación' : 'Continúa con tu negocio'}
                </h2>
                <p>
                  {pending
                    ? 'Empieza con tus datos. Cada registro queda guardado y puedes volver a este resumen cuando lo necesites.'
                    : 'Consulta la mercancía disponible y registra cada entrega con su precio y condición de pago.'}
                </p>
                {pending && data.ready ? (
                  <Button asChild>
                    <Link href={pending.href}>
                      {pending.action}
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                ) : null}
                {!pending && data.ready ? (
                  <div className="inline-actions">
                    <Button asChild>
                      <Link href="/ventas/nueva">
                        <ShoppingCart aria-hidden="true" />
                        Nueva venta
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/recepciones">
                        <Truck aria-hidden="true" />
                        Registrar recepción
                      </Link>
                    </Button>
                  </div>
                ) : null}
                {!data.ready ? (
                  <p className="operation-readiness">
                    La apertura está en preparación. Puedes revisar los módulos; todavía no se
                    registran operaciones comerciales.
                  </p>
                ) : null}
                <details className="operation-checklist" open={!!pending}>
                  <summary>{pending ? 'Pasos para empezar' : 'Registros de preparación'}</summary>
                  <ol>
                    {steps.map((step) => (
                      <li key={step.title} data-complete={step.done}>
                        {step.done ? (
                          <CheckCircle2 aria-hidden="true" />
                        ) : (
                          <Circle aria-hidden="true" />
                        )}
                        <div>
                          <h3>
                            {step.title}
                            <span>{step.done ? 'Registrado' : 'Pendiente'}</span>
                          </h3>
                          <p>{step.description}</p>
                          <Link href={step.href}>
                            {step.action}
                            <ArrowRight aria-hidden="true" />
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ol>
                </details>
              </section>
              <aside className="operation-guidance" aria-label="Orientación de la operación">
                {data.counts.receipts === 0 ? (
                  <section>
                    <Boxes aria-hidden="true" />
                    <h2>El inventario comienza vacío</h2>
                    <p>
                      Las existencias aparecen después de confirmar una recepción. Registrar una
                      fruta no agrega existencias al almacén.
                    </p>
                  </section>
                ) : (
                  <section>
                    <Truck aria-hidden="true" />
                    <h2>Cada ingreso conserva su empaque</h2>
                    <p>
                      Registra una nueva recepción para la mercancía que llegue. Los lotes
                      anteriores conservan la presentación con la que fueron recibidos.
                    </p>
                  </section>
                )}
                {data.counts.pendingConfigurations > 0 ? (
                  <section>
                    <h2>Empaques por confirmar</h2>
                    <p>
                      {data.counts.pendingConfigurations} configuraciones pendientes. Confirma sus
                      reglas antes de recibir o vender en producción.
                    </p>
                    <Link href="/catalogo">Revisar catálogo</Link>
                  </section>
                ) : null}
                <section>
                  <h2>Comprobantes comerciales</h2>
                  <p>
                    Las ventas y los abonos generan documentos internos descargables. No son
                    facturas fiscales.
                  </p>
                </section>
                {rate.error ? (
                  <LoadError error={rate.error} retry={() => void rate.reload()} />
                ) : rate.data ? (
                  <RateNotice rate={rate.data} />
                ) : (
                  <p className="commercial-help" role="status">
                    Consultando disponibilidad de BCV…
                  </p>
                )}
              </aside>
            </div>
          </>
        ) : null}
        <PageFooter />
      </main>
    </AppShell>
  );
}
