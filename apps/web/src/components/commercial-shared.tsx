'use client';
import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { AlertCircle, Download, HandCoins, Info, UserPlus } from 'lucide-react';
import {
  clientSchema,
  updateClientSchema,
  paymentSchema,
  type ClientSummary,
  type ClientAccount,
  type SaleSummary,
  type PaymentDetail,
} from '@mm/domain';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { NativeSelect } from './ui/native-select';
import { Field, FieldGroup, FieldLabel, FieldDescription } from './ui/field';
import { Alert, AlertDescription } from './ui/alert';
import { FormError, SaveButton, LoadError, LoadingRows } from './operations-ui';
import { useCommand, useRemote, displayMoney, displayDate } from '@/lib/inventory-api';
import { caracasDateTime, caracasInstant, normalizedMoney } from '@/lib/commercial-ui';
export type RateStatus = {
  status: 'available' | 'unavailable';
  rate: {
    id: string;
    rate: string;
    sourceUrl: string;
    validFrom: string;
    validUntil: string;
  } | null;
  message?: string;
};
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
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Tabla de datos: desplázate para ver todas las columnas">
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
                <Link className="row-link" href={'/ventas/' + s.id}>
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
                  <Link href={'/ventas/' + s.id}>Ver detalle</Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function RateNotice({ rate }: { rate: RateStatus | null }) {
  return (
    <Alert>
      <Info aria-hidden="true" />
      <AlertDescription>
        {rate?.status === 'available' && rate.rate ? (
          <span>
            BCV oficial verificado: {rate.rate.rate} VES por USD. El servidor comprobará su vigencia
            al confirmar el cobro.
          </span>
        ) : (
          <span>
            Tasa BCV no disponible. Los cobros en VES permanecen bloqueados. USD no requiere esta
            conversión.
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}
export function ClientDialog({
  editing,
  onClose,
  onSaved,
}: {
  editing?: ClientSummary;
  onClose: () => void;
  onSaved: (client: ClientSummary) => Promise<void>;
}) {
  const [name, setName] = useState(editing?.name ?? ''),
    [phone, setPhone] = useState(editing?.phone ?? ''),
    [taxId, setTaxId] = useState(editing?.taxId ?? ''),
    [address, setAddress] = useState(editing?.address ?? ''),
    [notes, setNotes] = useState(editing?.notes ?? ''),
    [active, setActive] = useState(editing?.active ?? true);
  const command = useCommand();
  async function save(e: FormEvent) {
    e.preventDefault();
    command.setError('');
    const body = {
      name,
      phone,
      taxId,
      address,
      notes,
      ...(editing ? { active, version: editing.version } : {}),
    };
    const parsed = (editing ? updateClientSchema : clientSchema).safeParse(body);
    if (!parsed.success) {
      command.setError(parsed.error.issues[0]?.message ?? 'Revisa los datos del cliente.');
      return;
    }
    try {
      const result = await command.run<ClientSummary>(
        editing ? '/api/clients/' + editing.id : '/api/clients',
        parsed.data,
        editing ? 'PATCH' : 'POST',
      );
      await onSaved(result);
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
          <DialogTitle>{editing ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          <DialogDescription>
            El teléfono con prefijo internacional permite abrir su chat de WhatsApp.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save}>
          <fieldset disabled={command.busy}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="client-name">Nombre del cliente</FieldLabel>
                <Input
                  id="client-name"
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-phone">WhatsApp con prefijo internacional</FieldLabel>
                <Input
                  id="client-phone"
                  name="tel"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  maxLength={40}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+58…"
                />
                <FieldDescription>
                  Opcional. Si falta, no estará disponible Cobrar por WhatsApp.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="client-tax">RIF o identificación</FieldLabel>
                <Input
                  id="client-tax"
                  value={taxId}
                  maxLength={40}
                  onChange={(e) => setTaxId(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-address">Dirección</FieldLabel>
                <Input
                  id="client-address"
                  value={address}
                  maxLength={250}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-notes">Observaciones del cliente</FieldLabel>
                <Textarea
                  id="client-notes"
                  value={notes}
                  maxLength={500}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              {editing ? (
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  Cliente activo
                </label>
              ) : null}
              <FormError message={command.error} />
              <div className="form-actions">
                <Button variant="outline" type="button" onClick={onClose}>
                  Cancelar
                </Button>
                <SaveButton busy={command.busy}>Guardar cliente</SaveButton>
              </div>
            </FieldGroup>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function PaymentDialog({
  clientId,
  saleId,
  onClose,
  onSaved,
}: {
  clientId: string;
  saleId?: string;
  onClose: () => void;
  onSaved: (payment: PaymentDetail) => Promise<void>;
}) {
  const account = useRemote<ClientAccount>('/api/clients/' + clientId),
    rate = useRemote<RateStatus>('/api/rates/current');
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD'),
    [amount, setAmount] = useState(''),
    [method, setMethod] = useState('Efectivo'),
    [date, setDate] = useState(''),
    [applications, setApplications] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ReturnType<typeof paymentSchema.parse> | null>(null);
  const command = useCommand();
  useEffect(() => setDate(caracasDateTime()), []);
  const invoices =
    account.data?.sales.filter(
      (s) => s.status === 'confirmed' && new Decimal(s.balanceUsd).gt(0),
    ) ?? [];
  const sum = Object.values(applications).reduce((a, v) => {
    try {
      return a.plus(normalizedMoney(v) || '0');
    } catch {
      return a;
    }
  }, new Decimal(0));
  let equivalent: string | null = null;
  try {
    const a = new Decimal(normalizedMoney(amount));
    if (a.gte(0))
      equivalent =
        currency === 'USD'
          ? a.toFixed(2)
          : rate.data?.status === 'available' && rate.data.rate
            ? a.div(rate.data.rate.rate).toFixed(2, Decimal.ROUND_HALF_UP)
            : null;
  } catch {}
  function setReceived(value: string) {
    setAmount(value);
    if (saleId && currency === 'USD')
      setApplications((current) => ({ ...current, [saleId]: value }));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    command.setError('');
    if (review) {
      try {
        const result = await command.run<PaymentDetail>('/api/payments', review);
        await onSaved(result);
      } catch {}
      return;
    }
    let receivedAt: string;
    try {
      receivedAt = caracasInstant(date);
    } catch (e) {
      command.setError(e instanceof Error ? e.message : 'Revisa la fecha.');
      return;
    }
    const parsed = paymentSchema.safeParse({
      clientId,
      currency,
      amount: normalizedMoney(amount),
      method,
      receivedAt,
      applications: invoices
        .filter((s) => applications[s.id]?.trim())
        .map((s) => ({ saleId: s.id, amountUsd: normalizedMoney(applications[s.id]) })),
    });
    if (!parsed.success) {
      command.setError(parsed.error.issues[0]?.message ?? 'Elige comprobante e indica el reparto.');
      return;
    }
    if (currency === 'VES' && rate.data?.status !== 'available') {
      command.setError('No hay una tasa BCV oficial vigente. Puedes registrar el cobro en USD.');
      return;
    }
    if (equivalent === null || !sum.eq(equivalent)) {
      command.setError(
        'El reparto debe coincidir exactamente con el equivalente USD recibido. Decide cómo aplicar el excedente antes de confirmar.',
      );
      return;
    }
    if (
      parsed.data.applications.some((a) =>
        new Decimal(a.amountUsd).gt(invoices.find((s) => s.id === a.saleId)?.balanceUsd ?? '0'),
      )
    ) {
      command.setError('Un importe aplicado supera el saldo del comprobante. Revisa el reparto.');
      return;
    }
    setReview(parsed.data);
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
          <DialogTitle>{review ? 'Confirmar abono' : 'Registrar abono'}</DialogTitle>
          <DialogDescription>
            {account.data?.client.name ?? 'Cargando cliente…'} · Elige explícitamente los
            comprobantes que recibirán el dinero.
          </DialogDescription>
        </DialogHeader>
        {account.error ? (
          <LoadError error={account.error} retry={() => void account.reload()} />
        ) : null}
        {!account.data && account.loading ? <LoadingRows /> : null}
        {account.data ? (
          <form onSubmit={submit}>
            <fieldset disabled={command.busy}>
              <FieldGroup>
                {review ? (
                  <div className="receipt-review">
                    <p>
                      <strong>
                        {review.currency} {review.amount}
                      </strong>{' '}
                      · {review.method}
                    </p>
                    <ul>
                      {review.applications.map((a) => (
                        <li key={a.saleId}>
                          <strong>{invoices.find((s) => s.id === a.saleId)?.number}</strong>
                          <span>{displayMoney(a.amountUsd)}</span>
                        </li>
                      ))}
                    </ul>
                    <p>
                      Se emitirá un recibo digital. No se enviará ningún mensaje automáticamente.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="commercial-form-grid">
                      <Field>
                        <FieldLabel htmlFor="payment-currency">Moneda recibida</FieldLabel>
                        <NativeSelect
                          id="payment-currency"
                          value={currency}
                          onChange={(e) => {
                            setCurrency(e.target.value as 'USD' | 'VES');
                            setApplications({});
                            setMethod(e.target.value === 'USD' ? 'Efectivo' : '');
                          }}
                        >
                          <option value="USD">USD</option>
                          <option value="VES" disabled={rate.data?.status !== 'available'}>
                            VES — requiere BCV verificado
                          </option>
                        </NativeSelect>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="payment-amount">Monto recibido</FieldLabel>
                        <Input
                          id="payment-amount"
                          required
                          inputMode="decimal"
                          value={amount}
                          onChange={(e) => setReceived(e.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="payment-method">Método de pago</FieldLabel>
                        <Input
                          id="payment-method"
                          required
                          minLength={2}
                          maxLength={80}
                          value={method}
                          onChange={(e) => setMethod(e.target.value)}
                          placeholder="Efectivo, transferencia…"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="payment-date">
                          Fecha y hora del cobro en Venezuela
                        </FieldLabel>
                        <Input
                          id="payment-date"
                          type="datetime-local"
                          required
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </Field>
                    </div>
                    <RateNotice rate={rate.data} />
                    <div>
                      <h3 className="commercial-section-title">Aplicar a comprobantes</h3>
                      <p className="commercial-help">
                        {saleId
                          ? 'Este abono comienza en el comprobante elegido. Revisa o distribuye su aplicación.'
                          : 'Escribe un importe junto a cada comprobante que quieras abonar. Los campos vacíos no reciben dinero.'}
                      </p>
                      <div className="payment-applications">
                        {invoices.map((s) => (
                          <div className="payment-application" key={s.id}>
                            <div>
                              <strong>
                                {s.number}
                                {s.id === saleId ? ' · Seleccionado' : ''}
                              </strong>
                              <small>Saldo: {displayMoney(s.balanceUsd)}</small>
                            </div>
                            <Field>
                              <FieldLabel htmlFor={'apply-' + s.id}>Aplicar USD</FieldLabel>
                              <Input
                                id={'apply-' + s.id}
                                aria-label={'Aplicar USD a ' + s.number}
                                inputMode="decimal"
                                value={applications[s.id] ?? ''}
                                onChange={(e) =>
                                  setApplications((current) => ({
                                    ...current,
                                    [s.id]: e.target.value,
                                  }))
                                }
                              />
                            </Field>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="commercial-line-summary">
                      <span>
                        Equivalente recibido:{' '}
                        <strong>{equivalent ? displayMoney(equivalent) : 'Pendiente'}</strong>
                      </span>
                      <span>
                        Total aplicado: <strong>{displayMoney(sum.toFixed(2))}</strong>
                      </span>
                    </p>
                    {!invoices.length ? (
                      <Alert>
                        <AlertCircle aria-hidden="true" />
                        <AlertDescription>
                          Este cliente no tiene comprobantes pendientes de pago.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                  </>
                )}
                <FormError message={command.error} />
                <div className="form-actions">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => (review ? setReview(null) : onClose())}
                  >
                    {review ? 'Volver a editar' : 'Cancelar'}
                  </Button>
                  <SaveButton busy={command.busy}>
                    {review ? 'Confirmar abono' : 'Revisar abono'}
                  </SaveButton>
                </div>
              </FieldGroup>
            </fieldset>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
export function PaymentSaved({ payment }: { payment: PaymentDetail }) {
  return (
    <div className="saved-notice" role="status">
      <HandCoins aria-hidden="true" />
      <span>
        Abono {payment.number} registrado.{' '}
        <a href={'/api/payments/' + payment.id + '/document'} download>
          <Download aria-hidden="true" />
          Descargar recibo PDF
        </a>
      </span>
    </div>
  );
}
