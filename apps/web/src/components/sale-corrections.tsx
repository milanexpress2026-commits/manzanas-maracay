'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { ZodError } from 'zod';
import { PackageMinus, PencilLine, Undo2 } from 'lucide-react';
import {
  refundAmounts,
  planSaleReduction,
  saleReductionCommandSchema,
  paymentCorrectionCommandSchema,
  type SaleDetail,
  type PaymentDetail,
} from '@mm/domain';
import type { AppSession } from './app-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { NativeSelect } from './ui/native-select';
import { Field, FieldLabel } from './ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { FormError, LoadingRows, SavedNotice } from './operations-ui';
import {
  useRemote,
  useDurableCommercialCommand,
  displayMoney,
  displayDate,
} from '@/lib/inventory-api';
import { commercialCommandBody } from '@/lib/commercial-journal';
import { presentationNames, normalizedMoney } from '@/lib/commercial-ui';
import styles from './sale-corrections.module.css';

type Command = ReturnType<typeof useDurableCommercialCommand>;
function correctionError(error: unknown): string {
  if (error instanceof ZodError) {
    if (error.issues.some((issue) => issue.path.includes('reason')))
      return 'Escribe un motivo de al menos 5 caracteres en los detalles del cambio.';
    if (
      error.issues.some(
        (issue) => issue.path.includes('amount') || issue.path.includes('applications'),
      )
    )
      return 'Escribe un monto válido, mayor o igual a cero y con hasta dos decimales. Revisa también el reparto entre ventas.';
    return 'Revisa las cantidades y elige qué hacer con la diferencia antes de guardar.';
  }
  if (error instanceof Error && /DecimalError|Invalid argument/.test(error.message))
    return 'Escribe un monto válido usando números y hasta dos decimales.';
  return error instanceof Error
    ? error.message
    : 'No se pudo guardar. Conserva el formulario y vuelve a intentarlo.';
}
export function SaleCorrectionActions({
  session,
  sale,
  onSaved,
}: {
  session: AppSession;
  sale: SaleDetail;
  onSaved: () => Promise<void>;
}) {
  const scope = session.environment + ':' + (session.operationScopeId ?? session.user.id);
  const reduction = useDurableCommercialCommand(scope, 'sale-reduction'),
    correction = useDurableCommercialCommand(scope, 'payment-correction');
  const [mode, setMode] = useState<'reduce' | 'cancel' | 'payment' | null>(null),
    [paymentId, setPaymentId] = useState(''),
    [notice, setNotice] = useState('');
  const pendingReduction = reduction.pending
    ? saleReductionCommandSchema.parse(commercialCommandBody(reduction.pending))
    : null;
  const pendingCorrection = correction.pending
    ? paymentCorrectionCommandSchema.parse(commercialCommandBody(correction.pending))
    : null;
  const saved = async () => {
    await onSaved();
    setMode(null);
    setNotice('Corrección guardada. La nota, el inventario y los saldos están actualizados.');
  };
  return (
    <>
      {notice ? <SavedNotice>{notice}</SavedNotice> : null}
      {pendingReduction ? (
        <div className={styles.pending} role="status">
          Hay una corrección de mercancía pendiente de confirmar.{' '}
          {pendingReduction.saleId === sale.id ? (
            <Button variant="outline" onClick={() => setMode('reduce')}>
              Recuperar corrección
            </Button>
          ) : (
            <Link href={'/ventas/' + pendingReduction.saleId}>Abrir esa venta</Link>
          )}
        </div>
      ) : null}
      {pendingCorrection ? (
        <div className={styles.pending} role="status">
          Hay un abono corregido pendiente de confirmar.{' '}
          <Button
            variant="outline"
            onClick={() => {
              setPaymentId(pendingCorrection.paymentId);
              setMode('payment');
            }}
          >
            Recuperar abono corregido
          </Button>
        </div>
      ) : null}
      {sale.status === 'confirmed' ? (
        <section className={'operations-panel ' + styles.actions} aria-label="Cambiar pedido">
          <h2>Cambiar pedido</h2>
          <div className="inline-actions">
            <Button asChild variant="outline">
              <Link prefetch={false} href={'/ventas/' + sale.id + '/editar'}>
                Agregar productos
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setMode('reduce')}>
              <PackageMinus aria-hidden="true" />
              Quitar productos
            </Button>
            <Button
              variant="outline"
              disabled={!sale.payments.some((p) => !p.reversed)}
              onClick={() => {
                setPaymentId(sale.payments.find((p) => !p.reversed)?.id ?? '');
                setMode('payment');
              }}
            >
              <PencilLine aria-hidden="true" />
              Corregir abono
            </Button>
            <Button variant="ghost" onClick={() => setMode('cancel')}>
              <Undo2 aria-hidden="true" />
              Anular venta
            </Button>
          </div>
          <p className="commercial-help">
            Si el cliente quita mercancía pagada, elige qué hacer con la diferencia al confirmar.
          </p>
        </section>
      ) : null}
      {sale.reductions?.length ? (
        <details className={'operations-panel ' + styles.history + ' ' + styles.orderHistory}>
          <summary>Cambios del pedido ({sale.reductions.length})</summary>
          <ul>
            {sale.reductions.map((r) => (
              <li key={r.id}>
                <strong>
                  {displayDate(r.createdAt)} · {displayMoney(r.reductionUsd)} retirados
                </strong>
                <span>
                  {r.resolution === 'refund'
                    ? 'Devolución registrada: ' + displayMoney(r.excessUsd)
                    : r.resolution === 'credit'
                      ? 'A favor del cliente: ' + displayMoney(r.excessUsd)
                      : 'Saldo de la venta actualizado'}
                </span>
                <small>{r.reason}</small>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {mode === 'reduce' || mode === 'cancel' ? (
        <ReductionDialog
          key={mode}
          sale={sale}
          cancelAll={mode === 'cancel'}
          command={reduction}
          onClose={() => setMode(null)}
          onSaved={saved}
        />
      ) : null}
      {mode === 'payment' ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !correction.busy) setMode(null);
          }}
        >
          <DialogContent className={styles.dialog} showCloseButton={!correction.busy}>
            <DialogHeader>
              <DialogTitle>Corregir abono</DialogTitle>
              <DialogDescription>
                Ajusta un importe anotado por error. Para devolver dinero por un producto retirado,
                usa «Quitar productos».
              </DialogDescription>
            </DialogHeader>
            {!pendingCorrection ? (
              <Field>
                <FieldLabel htmlFor="correct-payment-choice">Abono</FieldLabel>
                <NativeSelect
                  id="correct-payment-choice"
                  value={paymentId}
                  onChange={(e) => setPaymentId(e.target.value)}
                  disabled={correction.busy}
                >
                  {sale.payments
                    .filter((p) => !p.reversed)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.number} · {p.currency} {p.amount}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            ) : null}
            {paymentId ? (
              <PaymentCorrectionEditor
                key={paymentId}
                id={paymentId}
                command={correction}
                onSaved={saved}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function ReductionDialog({
  sale,
  cancelAll,
  command,
  onClose,
  onSaved,
}: {
  sale: SaleDetail;
  cancelAll: boolean;
  command: Command;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(sale.lines.map((l) => [l.id, cancelAll ? String(l.quantity) : '0'])),
  );
  const [resolution, setResolution] = useState<'refund' | 'credit' | ''>(''),
    [stockReturned, setStockReturned] = useState(false),
    [reason, setReason] = useState(
      cancelAll ? 'Cliente canceló el pedido' : 'Cliente cambió el pedido',
    );
  const [error, setError] = useState('');
  const pending = command.pending
    ? saleReductionCommandSchema.parse(commercialCommandBody(command.pending))
    : null;
  const foreign = !!pending && pending.saleId !== sale.id;
  const lines = sale.lines
    .map((l) => ({ lineId: l.id, quantity: Number(quantities[l.id] ?? 0) }))
    .filter((l) => l.quantity !== 0);
  let plan: ReturnType<typeof planSaleReduction> | null = null;
  try {
    if (lines.length) plan = planSaleReduction(sale.lines, lines, sale.paidUsd);
  } catch {}
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const body =
        pending ??
        saleReductionCommandSchema.parse({
          saleId: sale.id,
          clientId: sale.clientId,
          expectedVersion: sale.version ?? 0,
          lines,
          resolution: plan && new Decimal(plan.excessPaidUsd).gt(0) ? resolution : 'none',
          reason,
          stockReturned,
        });
      await command.run<SaleDetail>(
        body,
        plan
          ? { totalUsd: plan.totalUsd, balanceUsd: plan.balanceUsd }
          : (command.pending?.summary ?? null),
      );
      await onSaved();
    } catch (e) {
      setError(correctionError(e));
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !command.busy) onClose();
      }}
    >
      <DialogContent className={styles.dialog} showCloseButton={!command.busy}>
        <DialogHeader>
          <DialogTitle>{cancelAll ? 'Anular venta' : 'Quitar productos'}</DialogTitle>
          <DialogDescription>
            {sale.number} · {sale.clientName}. Indica lo que el cliente no se lleva.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className={styles.form}>
          {pending ? (
            <p className={styles.pending}>
              Se conserva la solicitud anterior. Recuperarla consulta o completa esa misma
              corrección, sin duplicar devoluciones.
            </p>
          ) : (
            <>
              <div className={styles.lines}>
                {sale.lines.map((l) => (
                  <Field key={l.id} className={styles.line}>
                    <div>
                      <FieldLabel htmlFor={'remove-' + l.id}>{l.description}</FieldLabel>
                      <small>
                        {presentationNames[l.presentation]} · Se llevó {l.quantity} ·{' '}
                        {displayMoney(l.agreedUnitUsd)} c/u
                      </small>
                    </div>
                    <div>
                      <label htmlFor={'remove-' + l.id} className={styles.quantityLabel}>
                        Quitar
                      </label>
                      <Input
                        id={'remove-' + l.id}
                        aria-label={
                          'Quitar ' + l.description + ' · ' + presentationNames[l.presentation]
                        }
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={l.quantity}
                        step={1}
                        value={quantities[l.id]}
                        disabled={command.busy || cancelAll}
                        onChange={(e) => setQuantities({ ...quantities, [l.id]: e.target.value })}
                      />
                    </div>
                  </Field>
                ))}
              </div>
              {plan ? (
                <div className={styles.result} aria-live="polite">
                  <dl>
                    <div>
                      <dt>Nuevo total</dt>
                      <dd>{displayMoney(plan.totalUsd)}</dd>
                    </div>
                    <div>
                      <dt>Queda por pagar</dt>
                      <dd>{displayMoney(plan.balanceUsd)}</dd>
                    </div>
                  </dl>
                  {new Decimal(plan.excessPaidUsd).gt(0) ? (
                    <fieldset disabled={command.busy} className={styles.resolution}>
                      <legend>Diferencia a resolver: {displayMoney(plan.excessPaidUsd)}</legend>
                      <label>
                        <input
                          type="radio"
                          name="resolution"
                          value="refund"
                          checked={resolution === 'refund'}
                          onChange={() => setResolution('refund')}
                          required
                        />
                        Devolver la diferencia
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="resolution"
                          value="credit"
                          checked={resolution === 'credit'}
                          onChange={() => setResolution('credit')}
                          required
                        />
                        Dejar a favor del cliente
                      </label>
                      <div>
                        {resolution === 'refund'
                          ? refundAmounts(sale.payments, plan.excessPaidUsd).map((r, i) => (
                              <p key={i}>
                                <strong>
                                  Devolver: {r.currency} {r.amount}
                                </strong>
                              </p>
                            ))
                          : null}
                      </div>
                      <p>
                        {resolution === 'refund'
                          ? 'Confirma después de devolver el dinero. Se registra contra los últimos cobros de esta venta y su tasa original.'
                          : resolution === 'credit'
                            ? 'Se guarda en USD y podrá usarse al cobrar otra venta de este cliente.'
                            : 'Elige qué hacen con el dinero que sobra.'}
                      </p>
                    </fieldset>
                  ) : null}
                </div>
              ) : (
                <p className="commercial-help">
                  Elige al menos una unidad para ver el nuevo total.
                </p>
              )}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={stockReturned}
                  onChange={(e) => setStockReturned(e.target.checked)}
                  required
                  disabled={command.busy}
                />
                La mercancía quedó en el local o fue devuelta.
              </label>
              <details>
                <summary>Motivo del cambio</summary>
                <Field>
                  <FieldLabel htmlFor="reduction-reason">Motivo</FieldLabel>
                  <Textarea
                    id="reduction-reason"
                    minLength={5}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={command.busy}
                  />
                </Field>
              </details>
            </>
          )}
          <FormError
            message={
              foreign
                ? 'Hay una corrección pendiente de otra venta. Recupérala primero.'
                : command.storageError || command.error || error
            }
          />
          <div className="inline-actions">
            <Button
              type="submit"
              disabled={
                command.busy ||
                !command.ready ||
                !!command.storageError ||
                foreign ||
                (!pending &&
                  (!plan ||
                    !stockReturned ||
                    (new Decimal(plan.excessPaidUsd).gt(0) && !resolution)))
              }
            >
              {command.busy
                ? 'Guardando…'
                : pending
                  ? 'Recuperar corrección'
                  : cancelAll
                    ? 'Confirmar anulación'
                    : 'Guardar cambio'}
            </Button>
            <Button type="button" variant="outline" disabled={command.busy} onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentCorrectionEditor({
  id,
  command,
  onSaved,
}: {
  id: string;
  command: Command;
  onSaved: () => Promise<void>;
}) {
  const remote = useRemote<PaymentDetail>('/api/payments/' + id);
  if (!remote.data)
    return (
      <>
        {remote.loading ? <LoadingRows /> : null}
        <FormError message={remote.error} />
      </>
    );
  return (
    <PaymentCorrectionForm
      key={remote.data.id + ':' + remote.data.version}
      payment={remote.data}
      command={command}
      onSaved={onSaved}
    />
  );
}
function PaymentCorrectionForm({
  payment,
  command,
  onSaved,
}: {
  payment: PaymentDetail;
  command: Command;
  onSaved: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(payment.amount),
    [applications, setApplications] = useState<Record<string, string>>(() =>
      Object.fromEntries(payment.applications.map((a) => [a.saleId, a.amountUsd])),
    ),
    [reason, setReason] = useState('Corrección del importe registrado'),
    [error, setError] = useState('');
  const pending = command.pending
    ? paymentCorrectionCommandSchema.parse(commercialCommandBody(command.pending))
    : null;
  const quote = payment.bcvRate?.rate ?? payment.usdtRate?.rate ?? null;
  function changeAmount(value: string) {
    setAmount(value);
    if (payment.applications.length === 1) {
      try {
        setApplications({
          [payment.applications[0]!.saleId]: new Decimal(normalizedMoney(value) || 0)
            .div(quote ?? 1)
            .toFixed(2),
        });
      } catch {}
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const body =
        pending ??
        paymentCorrectionCommandSchema.parse({
          paymentId: payment.id,
          clientId: payment.clientId,
          expectedVersion: payment.version ?? 0,
          amount: normalizedMoney(amount),
          reason,
          applications: payment.applications.map((a) => ({
            saleId: a.saleId,
            amountUsd: normalizedMoney(applications[a.saleId] ?? '0'),
          })),
        });
      await command.run<PaymentDetail>(body);
      await onSaved();
    } catch (e) {
      setError(correctionError(e));
    }
  }
  return (
    <form onSubmit={save} className={styles.form}>
      {pending ? (
        <p className={styles.pending}>
          Importe conservado: {pending.amount}. Recupera la misma solicitud para comprobar su
          resultado.
        </p>
      ) : (
        <>
          <p>
            Registrado:{' '}
            <strong>
              {payment.currency} {payment.amount}
            </strong>{' '}
            · {payment.number}
          </p>
          <Field>
            <FieldLabel htmlFor="correct-amount">Importe correcto · {payment.currency}</FieldLabel>
            <Input
              id="correct-amount"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => changeAmount(e.target.value)}
              disabled={command.busy}
            />
          </Field>
          {quote ? (
            <p className="commercial-help">
              Tasa original: Bs. {quote} por USD. No se sustituye por la de hoy.
            </p>
          ) : null}
          {payment.applications.length > 1 ? (
            <fieldset className={styles.form}>
              <legend>Aplicar a cada venta (USD)</legend>
              {payment.applications.map((a) => (
                <Field key={a.saleId}>
                  <FieldLabel htmlFor={'correct-' + a.saleId}>{a.number}</FieldLabel>
                  <Input
                    id={'correct-' + a.saleId}
                    inputMode="decimal"
                    required
                    value={applications[a.saleId]}
                    onChange={(e) =>
                      setApplications({ ...applications, [a.saleId]: e.target.value })
                    }
                    disabled={command.busy}
                  />
                </Field>
              ))}
            </fieldset>
          ) : null}
          <details>
            <summary>Motivo del ajuste</summary>
            <Field>
              <FieldLabel htmlFor="payment-correction-reason">Motivo</FieldLabel>
              <Textarea
                id="payment-correction-reason"
                value={reason}
                minLength={5}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                disabled={command.busy}
              />
            </Field>
          </details>
        </>
      )}
      {payment.corrections?.length ? (
        <details className={styles.history}>
          <summary>Historial del abono ({payment.corrections.length})</summary>
          <ul>
            {payment.corrections.map((c) => (
              <li key={c.id}>
                {displayDate(c.createdAt)} · {payment.currency} {c.amount}
                <small>{c.reason}</small>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <FormError message={command.storageError || command.error || error} />
      <Button
        type="submit"
        disabled={
          command.busy ||
          !command.ready ||
          !!command.storageError ||
          (!!pending && pending.paymentId !== payment.id)
        }
      >
        {command.busy ? 'Guardando…' : pending ? 'Recuperar abono corregido' : 'Guardar corrección'}
      </Button>
    </form>
  );
}
