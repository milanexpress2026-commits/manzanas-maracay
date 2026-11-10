'use client';
import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react';
import { quoteNow, type QuoteClock } from '@/lib/quote-clock';
import Link from 'next/link';
import Decimal from 'decimal.js';
import { AlertCircle, Download, HandCoins, Info, UserPlus, ChevronDown } from 'lucide-react';
import {
  clientSchema,
  updateClientSchema,
  paymentSchema,
  paymentMethodLabel,
  paymentSettlementBasis,
  type SettlementBasis,
  type ClientSummary,
  type ClientAccount,
  type SaleSummary,
  type PaymentDetail,
} from '@mm/domain';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Field, FieldGroup, FieldLabel, FieldDescription } from './ui/field';
import { Alert, AlertDescription } from './ui/alert';
import { FormError, SaveButton, LoadError, LoadingRows } from './operations-ui';
import {
  useCommand,
  useDurableCommercialCommand,
  useRemote,
  displayMoney,
  displayDate,
} from '@/lib/inventory-api';
import { CommercialJournalError, commercialCommandBody } from '@/lib/commercial-journal';
import type { AppSession } from './app-shell';
import { paymentEquivalent } from '@/lib/payment-equivalent';
import {
  officialReferenceDisplay,
  officialRateValueDate,
  type OfficialRateReference,
} from '@/lib/official-rate-reference';
import { caracasDateTime, caracasInstant, normalizedMoney } from '@/lib/commercial-ui';
import { PaymentMethodSelector } from './payment-method-selector';
import {
  paymentChoiceDetails,
  paymentChoiceUnavailable,
  type PaymentChoice,
} from '@/lib/sales-flow';
import styles from './sales-flow.module.css';
import { usePagedList } from '@/lib/use-paged-list';
export type RateValue = {
  clockAnchor?: QuoteClock;
  id: string;
  rate: string;
  sourceUrl: string;
  validFrom: string;
  validUntil: string;
  verifiedAt?: string;
  source?: string;
  officialValueDate?: string;
};
export type RateStatus = {
  checkedAt?: string;
  status: 'available' | 'unavailable';
  rate: RateValue | null;
  lastOfficial?: OfficialRateReference | null;
  message?: string;
  usdt?: { status: 'available' | 'unavailable'; rate: RateValue | null; message?: string };
};
export function useQuoteCurrent(quote: RateValue | null | undefined) {
  const [, setClock] = useState(() => Date.now());
  useEffect(() => {
    const now = quoteNow(quote?.clockAnchor);
    setClock(now);
    const timers = [Date.parse(quote?.validFrom ?? ''), Date.parse(quote?.validUntil ?? '')]
      .filter((time) => time > now)
      .map((time) =>
        window.setTimeout(
          () => setClock(quoteNow(quote?.clockAnchor)),
          Math.min(time - now + 10, 2_147_483_647),
        ),
      );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [quote?.id, quote?.validFrom, quote?.validUntil, quote?.clockAnchor]);
  const clock = quoteNow(quote?.clockAnchor);
  return !!quote && Date.parse(quote.validFrom) <= clock && clock < Date.parse(quote.validUntil);
}

export function useCurrentRates() {
  const remote = useRemote<RateStatus>('/api/rates/current');
  const data = useMemo(() => {
    if (!remote.data) return null;
    const clockAnchor =
      remote.data.checkedAt && Number.isFinite(Date.parse(remote.data.checkedAt))
        ? { serverMs: Date.parse(remote.data.checkedAt), monotonicMs: performance.now() }
        : undefined;
    return {
      ...remote.data,
      rate: remote.data.rate ? { ...remote.data.rate, clockAnchor } : null,
      usdt: remote.data.usdt
        ? {
            ...remote.data.usdt,
            rate: remote.data.usdt.rate ? { ...remote.data.usdt.rate, clockAnchor } : null,
          }
        : undefined,
    };
  }, [remote.data]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      timer = setTimeout(() => void remote.reload(), 150);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const interval = setInterval(refresh, 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [remote.reload]);
  return { ...remote, data };
}

export function UsdtReference({
  amount,
  quote,
  frozen = false,
}: {
  amount: string;
  quote: RateValue | null;
  frozen?: boolean;
}) {
  const current = useQuoteCurrent(quote);
  let equivalent: string | null = null;
  try {
    if (quote && (current || frozen) && new Decimal(normalizedMoney(amount) || 0).gte(0))
      equivalent = new Decimal(normalizedMoney(amount) || 0)
        .times(quote.rate)
        .toFixed(2, Decimal.ROUND_HALF_UP);
  } catch {}
  return (
    <div className={styles.usdtReference} role="region" aria-label="Referencia informativa USDT">
      <p>USDT se aplica 1:1 al saldo USD.</p>
      {equivalent && quote ? (
        <>
          <p className={styles.usdtEquivalent}>
            <span>Equivalencia informativa en Bs.</span>
            <strong>{displayMoney(equivalent).replace(/^USD /, 'VES ')}</strong>
          </p>
          <details className={styles.usdtQuoteDetails}>
            <summary>Fuente y vigencia de la referencia</summary>
            <RateSnapshot quote={quote} basis="divisa" />
          </details>
          <p className={styles.muted}>
            Esta referencia no modifica el precio ni el saldo. Si vence antes de guardar, el cobro
            USDT continúa sin referencia en bolívares.
          </p>
        </>
      ) : (
        <p>Equivalencia en Bs. no disponible. Puedes cobrar USDT normalmente.</p>
      )}
    </div>
  );
}

export function RateSnapshot({ quote, basis }: { quote: RateValue; basis: 'divisa' | 'bcv' }) {
  const time = quote.verifiedAt ? new Date(quote.verifiedAt) : null;
  const current = useQuoteCurrent(quote);
  const validFrom = new Date(quote.validFrom),
    validUntil = new Date(quote.validUntil);
  const valueDate = officialRateValueDate(quote.validFrom, quote.officialValueDate);
  return (
    <span>
      <strong>
        {basis === 'divisa' ? 'Binance P2P · compra · referencia general' : 'BCV oficial'}:{' '}
        {quote.rate} Bs. por {basis === 'divisa' ? 'USDT' : 'USD'}.
      </strong>
      <small className={styles.quoteMeta}>
        {current ? 'Vigente' : 'Fuera de vigencia'}
        {basis === 'bcv' && valueDate
          ? ' · Fecha valor: ' +
            new Intl.DateTimeFormat('es-VE', {
              timeZone: 'America/Caracas',
              dateStyle: 'short',
            }).format(valueDate)
          : basis === 'bcv'
            ? ' · Fecha valor no verificada'
            : ''}
        .
      </small>
      {time && Number.isFinite(time.valueOf()) ? (
        <small className={styles.quoteMeta}>
          Verificada{' '}
          {new Intl.DateTimeFormat('es-VE', {
            timeZone: 'America/Caracas',
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(time)}{' '}
          · Venezuela.
        </small>
      ) : null}
      {Number.isFinite(validUntil.valueOf()) ? (
        <small className={styles.quoteMeta}>
          Vigencia en el sistema{' '}
          {Number.isFinite(validFrom.valueOf())
            ? 'desde ' +
              new Intl.DateTimeFormat('es-VE', {
                timeZone: 'America/Caracas',
                dateStyle: 'short',
                timeStyle: 'short',
              }).format(validFrom) +
              ' '
            : ''}
          hasta{' '}
          {new Intl.DateTimeFormat('es-VE', {
            timeZone: 'America/Caracas',
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(validUntil)}{' '}
          · Venezuela.
        </small>
      ) : null}
      {basis === 'divisa' ? (
        <small className={styles.quoteMeta}>
          Referencia general sin filtro de banco o monto; no realiza un cambio de moneda ni
          garantiza una oferta.
        </small>
      ) : null}
      {quote.sourceUrl.startsWith('https://') ? (
        <a
          className={styles.quoteSource}
          href={quote.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Consultar fuente
        </a>
      ) : null}
    </span>
  );
}
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
export function RateNotice({ rate, basis }: { rate: RateStatus | null; basis?: SettlementBasis }) {
  const divisa = basis === 'divisa';
  const selected = divisa ? rate?.usdt : rate;
  const current = useQuoteCurrent(selected?.rate);
  const reference = !divisa ? officialReferenceDisplay(rate?.lastOfficial) : null;
  return (
    <Alert>
      <Info aria-hidden="true" />
      <AlertDescription>
        {selected?.status === 'available' && selected.rate && current ? (
          <RateSnapshot quote={selected.rate} basis={divisa ? 'divisa' : 'bcv'} />
        ) : reference ? (
          <span>
            <strong>Última BCV oficial verificada: {reference.amount} Bs. por USD.</strong>
            <small className={styles.quoteMeta}>
              Fecha valor: {reference.valueDate} · Venezuela.
            </small>
            <small className={styles.quoteMeta}>
              Referencia histórica; no habilita cobros en bolívares. USD y USDT se aplican 1:1.
            </small>
            <small className={styles.quoteMeta}>
              Verificada {reference.verifiedAt} · Venezuela.
            </small>
            <a
              className={styles.quoteSource}
              href={reference.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Consultar fuente BCV
            </a>
          </span>
        ) : (
          <span>
            {divisa ? 'Tasa USDT compra no disponible.' : 'Tasa BCV no disponible.'} No se puede
            cobrar en bolívares con este acuerdo hasta verificarla. USD y USDT se aplican 1:1.
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
            El nombre basta para empezar. Puedes añadir el contacto y otros datos después.
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
                <FieldLabel htmlFor="client-phone">WhatsApp (opcional)</FieldLabel>
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
                  Usa el prefijo internacional, por ejemplo +58. Se usa solo para abrir el chat.
                </FieldDescription>
              </Field>
              <details className={styles.optional} open={editing ? true : undefined}>
                <summary>
                  Más datos del cliente
                  <ChevronDown aria-hidden="true" />
                </summary>
                <FieldGroup>
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
                </FieldGroup>
              </details>
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
  session,
  clientId,
  saleId,
  onClose,
  onSaved,
}: {
  session: AppSession;
  clientId: string;
  saleId?: string;
  onClose: () => void;
  onSaved: (payment: PaymentDetail) => Promise<void> | void;
}) {
  const account = useRemote<ClientAccount>('/api/clients/' + clientId),
    rate = useCurrentRates();
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>('usd_cash'),
    [amount, setAmount] = useState(''),
    [date, setDate] = useState(''),
    [applications, setApplications] = useState<Record<string, string>>({});
  const { currency, method } = paymentChoiceDetails(paymentChoice);
  const [dateEdited, setDateEdited] = useState(false);
  const [reviewQuote, setReviewQuote] = useState<RateValue | null>(null);
  const [reviewInformation, setReviewInformation] = useState<RateValue | null>(null);
  const [reviewAttempted, setReviewAttempted] = useState(false);
  const reviewQuoteCurrent = useQuoteCurrent(reviewQuote);
  const [review, setReview] = useState<ReturnType<typeof paymentSchema.parse> | null>(null);
  const command = useDurableCommercialCommand(
    session.environment + ':' + (session.operationScopeId ?? session.user.id),
    'payment',
  );
  const restoredCommandKey = useRef<string | null>(null);
  const foreignPending =
    !!command.pending && commercialCommandBody(command.pending).clientId !== clientId;
  useEffect(() => {
    if (
      !command.pending ||
      command.busy ||
      foreignPending ||
      restoredCommandKey.current === command.pending.key
    )
      return;
    restoredCommandKey.current = command.pending.key;
    setReview(paymentSchema.parse(commercialCommandBody(command.pending)));
    setReviewAttempted(true);
    setReviewQuote(null);
    setReviewInformation(null);
  }, [command.pending, command.busy, foreignPending]);
  useEffect(() => setDate(caracasDateTime()), []);
  const pendingInvoices = usePagedList<SaleSummary>(
    '/api/sales?status=pending&clientId=' +
      encodeURIComponent(clientId) +
      (saleId ? '&prioritizeId=' + encodeURIComponent(saleId) : ''),
  );
  const invoices = pendingInvoices.data ?? [];
  const selectedInvoices = invoices.filter((invoice) => {
    try {
      return new Decimal(normalizedMoney(applications[invoice.id] ?? '') || 0).gt(0);
    } catch {
      return false;
    }
  });
  const basisInvoices = selectedInvoices.length
    ? selectedInvoices
    : invoices.filter((invoice) => invoice.id === saleId);
  let settlement: 'divisa' | 'bcv' | null = null;
  let agreementError = '';
  if (basisInvoices.length) {
    try {
      settlement = paymentSettlementBasis(basisInvoices.map((invoice) => invoice.settlementBasis));
    } catch {
      agreementError =
        'Estos comprobantes tienen acuerdos de precio diferentes. Registra sus abonos por separado.';
    }
  }
  const bcvCurrent = useQuoteCurrent(rate.data?.rate);
  const usdtCurrent = useQuoteCurrent(rate.data?.usdt?.rate);
  const quotes = {
    bcv: bcvCurrent && rate.data?.status === 'available',
    usdt: usdtCurrent && rate.data?.usdt?.status === 'available',
  };
  const paymentIssue = paymentChoiceUnavailable(
    paymentChoice,
    settlement,
    quotes,
    !!agreementError,
  );
  const quoteBasis =
    paymentChoice === 'ves_bcv' ? 'bcv' : paymentChoice === 'ves_usdt' ? 'divisa' : settlement;
  const quoted = quoteBasis === 'divisa' ? rate.data?.usdt : rate.data;
  const activeRate =
    !paymentIssue &&
    quoted?.status === 'available' &&
    (quoteBasis === 'divisa' ? quotes.usdt : quotes.bcv)
      ? quoted.rate
      : null;
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
        currency !== 'VES'
          ? a.toFixed(2)
          : settlement && activeRate
            ? paymentEquivalent(
                a.toFixed(2),
                activeRate,
                settlement,
                sum.gt(0) ? sum.toFixed(2) : undefined,
              )
            : null;
  } catch {}
  function setReceived(value: string) {
    setAmount(value);
    if (saleId) {
      let applied = value;
      if (currency === 'VES') {
        try {
          applied =
            activeRate && settlement
              ? paymentEquivalent(
                  normalizedMoney(value),
                  activeRate,
                  settlement,
                  invoices.find((invoice) => invoice.id === saleId)?.balanceUsd,
                )
              : '';
        } catch {
          applied = '';
        }
      }
      setApplications((current) => ({ ...current, [saleId]: applied }));
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    command.setError('');
    if (review) {
      if (reviewQuote && !reviewQuoteCurrent && !reviewAttempted) {
        command.setError(
          'La cotización venció. Vuelve a editar y actualiza la tasa antes de confirmar.',
        );
        return;
      }
      try {
        setReviewAttempted(true);
        const result = await command.run<PaymentDetail>(review);
        await onSaved(result);
      } catch (error) {
        if (error instanceof CommercialJournalError && error.editable) setReviewAttempted(false);
      }
      return;
    }
    if (!pendingInvoices.data || pendingInvoices.error) {
      command.setError('Espera a que carguen los comprobantes o vuelve a intentar la consulta.');
      return;
    }
    if (!selectedInvoices.length) {
      command.setError('Indica cuánto deseas aplicar al comprobante que vas a pagar.');
      return;
    }
    if (paymentIssue) {
      command.setError(paymentIssue);
      return;
    }
    if (currency === 'VES' && agreementError) {
      command.setError(agreementError);
      return;
    }
    if (currency === 'VES' && (!settlement || !activeRate)) {
      command.setError(
        'Selecciona comprobantes con el mismo acuerdo y actualiza su tasa para cobrar bolívares.',
      );
      return;
    }
    let receivedAt: string;
    try {
      receivedAt = dateEdited ? caracasInstant(date) : new Date().toISOString();
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
      dateMode: dateEdited ? 'manual' : 'automatic',
      ...(currency === 'VES' && activeRate ? { rateId: activeRate.id } : {}),
      ...(currency === 'USDT' && quotes.usdt && rate.data?.usdt?.rate
        ? { informationalUsdtRateId: rate.data.usdt.rate.id }
        : {}),
      applications: selectedInvoices.map((s) => ({
        saleId: s.id,
        amountUsd: normalizedMoney(applications[s.id]),
      })),
    });
    if (!parsed.success) {
      command.setError(parsed.error.issues[0]?.message ?? 'Elige comprobante e indica el reparto.');
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
    setReviewQuote(currency === 'VES' && activeRate ? { ...activeRate } : null);
    setReviewInformation(
      currency === 'USDT' && quotes.usdt && rate.data?.usdt?.rate
        ? { ...rate.data.usdt.rate }
        : null,
    );
    setReviewAttempted(false);
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
            {account.data?.client.name ?? 'Cargando cliente…'} · Revisa el importe y el comprobante
            que recibirá el abono.
          </DialogDescription>
        </DialogHeader>
        {account.error ? (
          <LoadError error={account.error} retry={() => void account.reload()} />
        ) : null}
        {!account.data && account.loading ? <LoadingRows /> : null}
        <FormError
          message={
            command.storageError ||
            (foreignPending
              ? 'Hay un abono pendiente de otro cliente. Cierra este formulario y usa «Recuperar abono pendiente» antes de registrar otro.'
              : '')
          }
        />
        {account.data || review ? (
          <form onSubmit={submit}>
            <fieldset
              disabled={command.busy || !command.ready || !!command.storageError || foreignPending}
              className={styles.payment}
            >
              <FieldGroup>
                {review ? (
                  <div className="receipt-review">
                    <p>
                      <strong>
                        {review.currency} {review.amount}
                      </strong>{' '}
                      · {paymentMethodLabel(review.method)}
                    </p>
                    {reviewQuote ? (
                      <p>
                        <RateSnapshot quote={reviewQuote} basis={quoteBasis ?? 'bcv'} />
                      </p>
                    ) : null}
                    {review.currency === 'USDT' ? (
                      <UsdtReference amount={review.amount} quote={reviewInformation} frozen />
                    ) : null}
                    {reviewAttempted && command.error ? (
                      <p role="status">
                        La confirmación sigue pendiente. Reintenta con estos mismos datos para
                        consultar o completar el abono sin duplicarlo.
                      </p>
                    ) : null}
                    <ul>
                      {review.applications.map((a) => (
                        <li key={a.saleId}>
                          <strong>
                            {invoices.find((s) => s.id === a.saleId)?.number ??
                              'Comprobante seleccionado'}
                          </strong>
                          <span>{displayMoney(a.amountUsd)}</span>
                        </li>
                      ))}
                    </ul>
                    <p>
                      Se emitirá un recibo digital. No se enviará ningún mensaje automáticamente.
                    </p>
                    {command.pending ? (
                      <p role="status">
                        Solicitud conservada. Confirmar recupera o completa este mismo abono aunque
                        el saldo o la cotización hayan cambiado.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <div className="commercial-form-grid">
                      <PaymentMethodSelector
                        id="payment-method"
                        value={paymentChoice}
                        basis={settlement}
                        quotes={quotes}
                        mixed={!!agreementError}
                        label="Método de pago"
                        onChange={(choice) => {
                          const next = paymentChoiceDetails(choice);
                          if (next.currency === 'VES' || currency === 'VES') setAmount('');
                          setPaymentChoice(choice);
                        }}
                      />
                      <Field>
                        <FieldLabel htmlFor="payment-amount">
                          Monto recibido · {currency}
                        </FieldLabel>
                        <Input
                          id="payment-amount"
                          required
                          inputMode="decimal"
                          value={amount}
                          onChange={(e) => setReceived(e.target.value)}
                        />
                        {saleId && invoices.some((invoice) => invoice.id === saleId) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              const balance = invoices.find(
                                (invoice) => invoice.id === saleId,
                              )!.balanceUsd;
                              setReceived(
                                currency === 'VES' && activeRate
                                  ? new Decimal(balance)
                                      .times(activeRate.rate)
                                      .toFixed(2, Decimal.ROUND_HALF_UP)
                                  : balance,
                              );
                            }}
                          >
                            Cobrar saldo completo
                          </Button>
                        ) : null}
                      </Field>
                      <details className={styles.optional}>
                        <summary>
                          Fecha del cobro
                          <ChevronDown aria-hidden="true" />
                        </summary>
                        <Field>
                          <FieldLabel htmlFor="payment-date">
                            Fecha y hora del cobro en Venezuela
                          </FieldLabel>
                          <Input
                            id="payment-date"
                            type="datetime-local"
                            required
                            value={date}
                            onChange={(e) => {
                              setDate(e.target.value);
                              setDateEdited(true);
                            }}
                          />
                          <FieldDescription>
                            La hora se guarda automáticamente al confirmar. Cambia este campo solo
                            para un cobro anterior.
                          </FieldDescription>
                          {dateEdited ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setDateEdited(false)}
                            >
                              Usar fecha automática
                            </Button>
                          ) : null}
                        </Field>
                      </details>
                    </div>
                    {currency === 'USDT' ? (
                      <UsdtReference
                        amount={amount}
                        quote={quotes.usdt ? (rate.data?.usdt?.rate ?? null) : null}
                      />
                    ) : null}
                    {currency === 'VES' ? (
                      <>
                        <RateNotice rate={rate.data} basis={quoteBasis ?? undefined} />
                        <Button type="button" variant="outline" onClick={() => void rate.reload()}>
                          Actualizar tasa
                        </Button>
                      </>
                    ) : (
                      <details className={styles.optional}>
                        <summary>
                          Monedas y tasas
                          <ChevronDown aria-hidden="true" />
                        </summary>
                        <p className="commercial-help">
                          USD y USDT se aplican 1:1. Los pagos conservan el precio y la condición
                          acordados en cada venta.
                        </p>
                        {settlement ? (
                          <RateNotice rate={rate.data} basis={settlement} />
                        ) : (
                          <p className="commercial-help">
                            Selecciona un comprobante para consultar la tasa correspondiente.
                          </p>
                        )}
                        <Button type="button" variant="outline" onClick={() => void rate.reload()}>
                          Actualizar tasas
                        </Button>
                      </details>
                    )}
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
                              <small>
                                {s.settlementBasis === 'divisa'
                                  ? 'Promocional divisa'
                                  : 'Acuerdo Bs. BCV'}
                              </small>
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
                      {pendingInvoices.error ? (
                        <LoadError
                          error={pendingInvoices.error}
                          retry={() => void pendingInvoices.reload()}
                        />
                      ) : null}
                      {pendingInvoices.loading ? (
                        <p role="status">Cargando comprobantes pendientes…</p>
                      ) : null}
                      {pendingInvoices.hasMore ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={pendingInvoices.loading}
                          onClick={() => void pendingInvoices.loadMore()}
                        >
                          Cargar más pendientes
                        </Button>
                      ) : null}
                    </div>
                    {currency === 'VES' && agreementError ? (
                      <FormError message={agreementError} />
                    ) : null}
                    <p className="commercial-line-summary">
                      <span>
                        Equivalente recibido:{' '}
                        <strong>{equivalent ? displayMoney(equivalent) : 'Pendiente'}</strong>
                      </span>
                      <span>
                        Total aplicado: <strong>{displayMoney(sum.toFixed(2))}</strong>
                      </span>
                    </p>
                    {!invoices.length &&
                    pendingInvoices.data &&
                    !pendingInvoices.loading &&
                    !pendingInvoices.error ? (
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
                {command.authNeeded ? (
                  <Link href="/login">Iniciar sesión para recuperar este abono</Link>
                ) : null}
                <div className="form-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={command.busy}
                    onClick={() =>
                      reviewAttempted ? onClose() : review ? setReview(null) : onClose()
                    }
                  >
                    {reviewAttempted ? 'Cerrar resumen' : review ? 'Volver a editar' : 'Cancelar'}
                  </Button>
                  <SaveButton
                    busy={command.busy}
                    disabled={
                      !review &&
                      (!pendingInvoices.data || !!pendingInvoices.error || !invoices.length)
                    }
                  >
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
export function PendingPaymentRecovery({
  session,
  onSaved,
}: {
  session: AppSession;
  onSaved: (payment: PaymentDetail) => Promise<void> | void;
}) {
  const command = useDurableCommercialCommand(
    session.environment + ':' + (session.operationScopeId ?? session.user.id),
    'payment',
  );
  const [open, setOpen] = useState(false);
  if (command.storageError) return <FormError message={command.storageError} />;
  if (!command.pending) return null;
  const pending = paymentSchema.parse(commercialCommandBody(command.pending));
  return (
    <>
      <section className="saved-notice" aria-label="Abono pendiente de confirmación">
        <p>
          Hay un abono pendiente de confirmación en este dispositivo. Recupéralo antes de registrar
          otro.
        </p>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          Recuperar abono pendiente
        </Button>
      </section>
      {open ? (
        <PaymentDialog
          session={session}
          clientId={pending.clientId}
          onClose={() => setOpen(false)}
          onSaved={async (payment) => {
            setOpen(false);
            await onSaved(payment);
          }}
        />
      ) : null}
    </>
  );
}
export function PaymentSaved({ payment }: { payment: PaymentDetail }) {
  return (
    <div className="saved-notice" role="status">
      <HandCoins aria-hidden="true" />
      <span>
        Abono {payment.number} registrado.{' '}
        {payment.usdtReferenceRate ? (
          <span>
            Referencia informativa guardada:{' '}
            {displayMoney(payment.usdtReferenceRate.equivalentVes).replace(/^USD /, 'VES ')} ·
            Binance P2P compra · {payment.usdtReferenceRate.rate} Bs./USDT.{' '}
          </span>
        ) : payment.currency === 'USDT' ? (
          <span>USDT aplicado 1:1. Sin referencia informativa en Bs. </span>
        ) : null}
        <a href={'/api/payments/' + payment.id + '/document'} download>
          <Download aria-hidden="true" />
          Descargar recibo PDF
        </a>
      </span>
    </div>
  );
}
