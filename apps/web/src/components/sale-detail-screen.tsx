'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { ArrowLeft, HandCoins, CalendarDays, Undo2, MessageCircle, FileText } from 'lucide-react';
import {
  changeSaleDatesSchema,
  paymentMethodLabel,
  commerceReversalSchema,
  type SaleDetail,
  type PaymentDetail,
} from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Field, FieldGroup, FieldLabel, FieldDescription } from './ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import {
  LoadError,
  LoadingRows,
  PageFooter,
  FormError,
  SaveButton,
  SavedNotice,
} from './operations-ui';
import { PaymentDialog, PaymentSaved, PendingPaymentRecovery, DueBadge } from './commercial-shared';
import { SaleDocumentActions } from './sale-document-actions';
import { useRemote, useCommand, readApi, displayMoney, displayDate } from '@/lib/inventory-api';
import { presentationNames, caracasDate, addCaracasDays } from '@/lib/commercial-ui';
export function SaleDetailScreen({
  session,
  id,
  justSaved = false,
}: {
  session: AppSession;
  id: string;
  justSaved?: boolean;
}) {
  const detail = useRemote<SaleDetail>('/api/sales/' + id);
  const [paymentOpen, setPaymentOpen] = useState(false),
    [payment, setPayment] = useState<PaymentDetail | null>(null),
    [dates, setDates] = useState(false),
    [correction, setCorrection] = useState<{ url: string; title: string; text: string } | null>(
      null,
    ),
    [notice, setNotice] = useState(''),
    [whatsBusy, setWhatsBusy] = useState(false),
    [whatsError, setWhatsError] = useState('');
  async function whatsapp() {
    setWhatsBusy(true);
    setWhatsError('');
    try {
      const fresh = await readApi<SaleDetail>('/api/sales/' + id);
      if (!fresh.whatsappUrl || !fresh.whatsappUrl.startsWith('https://wa.me/')) {
        await detail.reload();
        throw new Error(
          'El comprobante ya no tiene saldo o falta un teléfono válido. Revisa la ficha del cliente.',
        );
      }
      window.location.assign(fresh.whatsappUrl);
    } catch (e) {
      setWhatsError(e instanceof Error ? e.message : 'No se pudo consultar el saldo actual.');
      setWhatsBusy(false);
    }
  }
  const sale = detail.data;
  return (
    <AppShell session={session} current="/ventas">
      <main id="app-main" className="main-content operations-page">
        <Link className="back-link" href="/ventas">
          <ArrowLeft aria-hidden="true" />
          Ventas
        </Link>
        {detail.error ? (
          <LoadError error={detail.error} retry={() => void detail.reload()} />
        ) : null}
        {detail.loading && !sale ? <LoadingRows /> : null}
        <PendingPaymentRecovery
          session={session}
          onSaved={async (saved) => {
            setPayment(saved);
            await detail.reload();
          }}
        />
        {sale ? (
          <>
            <div className="commercial-detail-heading">
              <div>
                <p className="commercial-help">
                  Comprobante de venta {sale.isDemo ? '· DEMO' : ''}
                </p>
                <h1>{sale.number}</h1>
                <Link href={'/clientes/' + sale.clientId}>{sale.clientName}</Link>
              </div>
              <div className="inline-actions">
                <DueBadge sale={sale} />
              </div>
            </div>
            {justSaved && sale.status === 'confirmed' ? (
              <SavedNotice>
                Venta guardada · {sale.number} · {displayMoney(sale.totalUsd)}. Puedes abrir la nota
                de entrega o registrar una nueva venta.
              </SavedNotice>
            ) : null}
            <SaleDocumentActions id={id} cancelled={sale.status === 'cancelled'} />
            {notice ? <SavedNotice>{notice}</SavedNotice> : null}
            {payment ? <PaymentSaved payment={payment} /> : null}
            <div className="commercial-layout">
              <div>
                <section className="operations-panel">
                  <dl className="document-facts">
                    <div>
                      <dt>Fecha en Venezuela</dt>
                      <dd>{displayDate(sale.soldAt)}</dd>
                    </div>
                    <div>
                      <dt>Condición</dt>
                      <dd>{sale.condition === 'cash' ? 'Contado' : 'Crédito'}</dd>
                    </div>
                    <div>
                      <dt>Acuerdo de cobro</dt>
                      <dd>
                        {sale.settlementBasis === 'divisa'
                          ? 'Promocional divisa'
                          : sale.settlementBasis === 'legacy_bcv'
                            ? 'Acuerdo histórico · BCV'
                            : 'Regular · Bs. BCV'}
                      </dd>
                    </div>
                    <div>
                      <dt>Operador</dt>
                      <dd>{sale.actor}</dd>
                    </div>
                    <div>
                      <dt>Pago pactado</dt>
                      <dd>{sale.dueDate ?? 'Sin fecha pactada'}</dd>
                    </div>
                    <div>
                      <dt>Recordatorio interno</dt>
                      <dd>{sale.reminderDate ?? 'Sin recordatorio'}</dd>
                    </div>
                    <div>
                      <dt>Fecha pactada original</dt>
                      <dd>{sale.originalDueDate ?? 'Sin fecha pactada'}</dd>
                    </div>
                  </dl>
                  <div
                    className="table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Tabla de datos: desplázate para ver todas las columnas"
                  >
                    <table className="commercial-table">
                      <caption className="sr-only">Líneas del comprobante confirmado</caption>
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Cantidad</th>
                          <th>Precio por unidad</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sale.lines.map((line) => (
                          <tr key={line.id}>
                            <td>
                              <strong>{line.description}</strong>
                              <small>
                                {line.presentation === 'box' && line.commercialUnitLabel
                                  ? line.commercialUnitLabel
                                  : presentationNames[line.presentation]}
                              </small>
                            </td>
                            <td>{line.quantity}</td>
                            <td>{displayMoney(line.agreedUnitUsd)}</td>
                            <td>
                              <strong>{displayMoney(line.totalUsd)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {sale.notes ? <p className="inline-explanation">{sale.notes}</p> : null}
                  <p className="inline-explanation">
                    Documento comercial. No se presenta como factura fiscal SENIAT.
                  </p>
                </section>
                <section className="operations-panel">
                  <div className="panel-heading">
                    <FileText aria-hidden="true" />
                    <h2>Origen de la mercancía</h2>
                  </div>
                  <ul className="commercial-history">
                    {sale.lines.map((line) => (
                      <li key={line.id}>
                        <div>
                          <strong>{line.description}</strong>
                          <small>
                            {line.allocations.length} asignaciones a existencias históricas
                          </small>
                          <details>
                            <summary>Ver lotes entregados</summary>
                            {line.allocations.map((a, index) => (
                              <p key={a.containerId + '-' + index}>
                                <Link href={'/inventario?lote=' + a.lotId}>
                                  Lote {a.lotId.slice(0, 8)}
                                </Link>{' '}
                              </p>
                            ))}
                          </details>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="inline-explanation">
                    Se entregan primero las existencias más antiguas. El orden físico de la cava
                    debe acompañar esa salida.
                  </p>
                </section>
                <section className="operations-panel">
                  <div className="panel-heading">
                    <HandCoins aria-hidden="true" />
                    <h2>Abonos aplicados</h2>
                  </div>
                  {sale.payments.length ? (
                    <ul className="commercial-history">
                      {sale.payments.map((p) => (
                        <li key={p.id}>
                          <div>
                            <strong>
                              {p.number} · {displayMoney(p.appliedUsd)} aplicado
                            </strong>
                            <small>
                              Recibido: {p.currency} {p.amount} · {paymentMethodLabel(p.method)} ·{' '}
                              {displayDate(p.receivedAt)}
                              {p.reversed ? ' · Revertido' : ''}
                            </small>
                          </div>
                          <div className="inline-actions">
                            <a href={'/api/payments/' + p.id + '/document'} download>
                              Recibo PDF
                            </a>
                            {!p.reversed ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setCorrection({
                                    url: '/api/payments/' + p.id + '/reverse',
                                    title: 'Revertir abono ' + p.number,
                                    text: 'Se compensará el abono completo y sus aplicaciones. El recibo original y la auditoría se conservan; los saldos volverán a quedar pendientes.',
                                  })
                                }
                              >
                                Revertir abono
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="inline-explanation">
                      No hay abonos aplicados a este comprobante.
                    </p>
                  )}
                </section>
                {sale.dateHistory.length ? (
                  <section className="operations-panel">
                    <div className="panel-heading">
                      <CalendarDays aria-hidden="true" />
                      <h2>Historial de fechas</h2>
                    </div>
                    <ul className="commercial-history">
                      {sale.dateHistory.map((change) => (
                        <li key={change.id}>
                          <div>
                            <strong>Pago pactado: {change.dueDate ?? 'sin fecha'}</strong>
                            <p>Recordatorio interno: {change.reminderDate ?? 'sin fecha'}</p>
                            <p>{change.reason}</p>
                            <small>
                              {displayDate(change.createdAt)} · {change.actor}
                            </small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {sale.cancellation ? (
                  <section className="operations-panel commercial-form-panel">
                    <h2>Venta anulada</h2>
                    <p>{sale.cancellation.reason}</p>
                    <p className="commercial-help">
                      {displayDate(sale.cancellation.createdAt)} · {sale.cancellation.actor}
                    </p>
                  </section>
                ) : null}
              </div>
              <aside className="commercial-summary">
                <h2>Cuenta del comprobante</h2>
                <dl>
                  <div>
                    <dt>Total venta</dt>
                    <dd>{displayMoney(sale.totalUsd)}</dd>
                  </div>
                  <div>
                    <dt>Abonos aplicados</dt>
                    <dd>{displayMoney(sale.paidUsd)}</dd>
                  </div>
                  <div className="summary-total">
                    <dt>Saldo pendiente</dt>
                    <dd>{displayMoney(sale.balanceUsd)}</dd>
                  </div>
                </dl>
                {sale.status === 'confirmed' ? (
                  <>
                    <Button
                      disabled={new Decimal(sale.balanceUsd).lte(0)}
                      onClick={() => setPaymentOpen(true)}
                    >
                      <HandCoins aria-hidden="true" />
                      Registrar abono
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!sale.whatsappUrl || whatsBusy}
                      onClick={() => void whatsapp()}
                    >
                      <MessageCircle aria-hidden="true" />
                      {whatsBusy ? 'Consultando saldo…' : 'Cobrar por WhatsApp'}
                    </Button>
                    {!sale.client.phone ? (
                      <p>
                        Agrega un teléfono internacional en la ficha del cliente para abrir su chat.
                      </p>
                    ) : null}
                    <FormError message={whatsError} />
                    {sale.condition === 'credit' && new Decimal(sale.balanceUsd).gt(0) ? (
                      <Button variant="outline" onClick={() => setDates(true)}>
                        <CalendarDays aria-hidden="true" />
                        Cambiar fechas
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setCorrection({
                          url: '/api/sales/' + id + '/cancel',
                          title: 'Anular venta',
                          text: 'La anulación conserva el documento y crea movimientos compensatorios. Primero deben revertirse los abonos; el servidor comprobará que las existencias se puedan restaurar sin afectar movimientos posteriores.',
                        })
                      }
                    >
                      <Undo2 aria-hidden="true" />
                      Anular venta
                    </Button>
                  </>
                ) : null}
              </aside>
            </div>
          </>
        ) : null}
        <PageFooter />
      </main>
      {sale && paymentOpen ? (
        <PaymentDialog
          session={session}
          clientId={sale.clientId}
          saleId={sale.id}
          onClose={() => setPaymentOpen(false)}
          onSaved={async (p) => {
            setPayment(p);
            setPaymentOpen(false);
            await detail.reload();
          }}
        />
      ) : null}
      {sale && dates ? (
        <DatesDialog
          sale={sale}
          onClose={() => setDates(false)}
          onSaved={async () => {
            setDates(false);
            setNotice('Fechas actualizadas con historial.');
            await detail.reload();
          }}
        />
      ) : null}
      {correction ? (
        <CorrectionDialog
          {...correction}
          onClose={() => setCorrection(null)}
          onSaved={async () => {
            setCorrection(null);
            setNotice('Corrección registrada. El historial se conserva.');
            await detail.reload();
          }}
        />
      ) : null}
    </AppShell>
  );
}
function DatesDialog({
  sale,
  onClose,
  onSaved,
}: {
  sale: SaleDetail;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [due, setDue] = useState(sale.dueDate ?? ''),
    [reminder, setReminder] = useState(sale.reminderDate ?? ''),
    [reason, setReason] = useState('');
  const command = useCommand();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = changeSaleDatesSchema.safeParse({
      dueDate: due || null,
      reminderDate: reminder || null,
      reason,
    });
    if (!parsed.success) {
      command.setError(parsed.error.issues[0]?.message ?? 'Revisa las fechas y el motivo.');
      return;
    }
    try {
      await command.run('/api/sales/' + sale.id + '/dates', parsed.data);
      await onSaved();
    } catch {}
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !command.busy) onClose();
      }}
    >
      <DialogContent className="catalog-dialog">
        <DialogHeader>
          <DialogTitle>Cambiar fechas</DialogTitle>
          <DialogDescription>
            La fecha pactada original se conserva en el historial.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <fieldset disabled={command.busy}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="change-due">Nueva fecha de pago pactada</FieldLabel>
                <Input
                  id="change-due"
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
                <div className="date-shortcuts">
                  {[7, 15].map((days) => (
                    <Button
                      key={days}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setDue(addCaracasDays(caracasDate(), days))}
                    >
                      {days} días
                    </Button>
                  ))}
                  <Button type="button" size="sm" variant="ghost" onClick={() => setDue('')}>
                    Sin fecha
                  </Button>
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="change-reminder">Recordatorio interno</FieldLabel>
                <Input
                  id="change-reminder"
                  type="date"
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value)}
                />
                <FieldDescription>
                  Una llamada pendiente no equivale a una promesa de pago del cliente.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="change-reason">Motivo del cambio</FieldLabel>
                <Textarea
                  id="change-reason"
                  required
                  minLength={5}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <FormError message={command.error} />
              <div className="form-actions">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <SaveButton busy={command.busy}>Guardar fechas</SaveButton>
              </div>
            </FieldGroup>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function CorrectionDialog({
  url,
  title,
  text,
  onClose,
  onSaved,
}: {
  url: string;
  title: string;
  text: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [reason, setReason] = useState(''),
    [review, setReview] = useState(false);
  const command = useCommand();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = commerceReversalSchema.safeParse({ reason });
    if (!parsed.success) {
      command.setError(parsed.error.issues[0]?.message ?? 'Explica el motivo.');
      return;
    }
    if (!review) {
      setReview(true);
      return;
    }
    try {
      await command.run(url, parsed.data);
      await onSaved();
    } catch {}
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !command.busy) onClose();
      }}
    >
      <DialogContent className="catalog-dialog">
        <DialogHeader>
          <DialogTitle>
            {review ? 'Confirmar: ' : ''}
            {title}
          </DialogTitle>
          <DialogDescription>{text}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <fieldset disabled={command.busy}>
            <Field>
              <FieldLabel htmlFor="correction-reason">Motivo de la corrección</FieldLabel>
              <Textarea
                id="correction-reason"
                required
                minLength={5}
                maxLength={500}
                value={reason}
                readOnly={review}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <FormError message={command.error} />
            <div className="form-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => (review ? setReview(false) : onClose())}
              >
                {review ? 'Volver a editar' : 'Cancelar'}
              </Button>
              <SaveButton busy={command.busy}>
                {review ? 'Confirmar corrección' : 'Revisar corrección'}
              </SaveButton>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
