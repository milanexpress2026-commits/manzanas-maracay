'use client';
import { useState, useEffect, useRef, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import {
  Plus,
  Minus,
  ChevronDown,
  Search,
  ShoppingCart,
  Trash2,
  ArrowLeft,
  UserPlus,
} from 'lucide-react';
import {
  manualSaleSchema,
  paymentMethodLabel,
  type SaleSummary,
  type SaleDetail,
  type Catalog,
  type Presentation,
  type SaleAvailability,
} from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { NativeSelect } from './ui/native-select';
import { Field, FieldGroup, FieldSet, FieldLegend, FieldLabel, FieldDescription } from './ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { LoadError, LoadingRows, PageFooter, FormError, SaveButton } from './operations-ui';
import {
  ClientDialog,
  SaleTable,
  RateNotice,
  RateSnapshot,
  UsdtReference,
  useQuoteCurrent,
  type RateStatus,
  type RateValue,
} from './commercial-shared';
import { useRemote, useDurableCommercialCommand, displayMoney } from '@/lib/inventory-api';
import { CommercialJournalError, commercialCommandBody } from '@/lib/commercial-journal';
import { paymentEquivalent } from '@/lib/payment-equivalent';
import { useClientDirectory } from '@/lib/use-client-directory';
import {
  productLabel,
  presentationNames,
  normalizedMoney,
  caracasDateTime,
  caracasDate,
  addCaracasDays,
} from '@/lib/commercial-ui';
import { PaymentMethodSelector } from './payment-method-selector';
import {
  paymentChoiceDetails,
  paymentChoiceUnavailable,
  type PaymentChoice,
  emptySaleLine,
  salePresentations,
  changeSaleLine,
  saleLineTotal,
  saleReviewInstant,
  keepSaleDraft,
  takeSaleDraft,
  clearSaleDraft,
  type SaleDraftLine,
} from '@/lib/sales-flow';
import styles from './sales-flow.module.css';
export function SalesScreen({ session }: { session: AppSession }) {
  const sales = useRemote<SaleSummary[]>('/api/sales?limit=200');
  const pendingSale = useDurableCommercialCommand(
    session.environment + ':' + session.user.id,
    'sale',
  );
  const [query, setQuery] = useState('');
  const rows = (sales.data ?? []).filter((s) =>
    (s.number + ' ' + s.clientName)
      .toLocaleLowerCase('es')
      .includes(query.toLocaleLowerCase('es').trim()),
  );
  return (
    <AppShell session={session} current="/ventas">
      <main id="app-main" className="main-content operations-page">
        <div className="page-heading">
          <div>
            <h1>Ventas</h1>
            <p>La mercancía entregada, el precio pactado y cada saldo pendiente.</p>
          </div>
          <Button asChild>
            <Link href="/ventas/nueva">
              <Plus aria-hidden="true" />
              Nueva venta
            </Link>
          </Button>
        </div>
        <FormError message={pendingSale.storageError} />
        {pendingSale.pending ? (
          <section className="saved-notice" aria-label="Venta pendiente de confirmación">
            <p>Hay una venta pendiente de confirmación en este dispositivo.</p>
            <Button asChild variant="outline">
              <Link href="/ventas/nueva">Recuperar venta pendiente</Link>
            </Button>
          </section>
        ) : null}
        {sales.error ? <LoadError error={sales.error} retry={() => void sales.reload()} /> : null}
        {sales.loading && !sales.data ? <LoadingRows /> : null}
        {sales.data ? (
          <>
            <div className="commercial-toolbar">
              <div className="search-field">
                <Search aria-hidden="true" />
                <Input
                  aria-label="Buscar ventas"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar comprobante o cliente…"
                />
              </div>
            </div>
            <section className="operations-panel" aria-label="Ventas registradas">
              {rows.length ? (
                <SaleTable sales={rows} />
              ) : (
                <div className="commercial-empty">
                  <ShoppingCart aria-hidden="true" />
                  <h2>{query ? 'No encontramos coincidencias' : 'Registra la primera venta'}</h2>
                  <p>Selecciona cliente y productos e indica el precio de esta venta.</p>
                  <Button asChild variant="outline">
                    <Link href="/ventas/nueva">Registrar venta</Link>
                  </Button>
                </div>
              )}
            </section>
          </>
        ) : null}
        <PageFooter />
      </main>
    </AppShell>
  );
}
export function NewSaleScreen({ session }: { session: AppSession }) {
  const router = useRouter();
  const catalog = useRemote<Catalog>('/api/catalog');
  const availability = useRemote<SaleAvailability>('/api/inventory/sale-availability');
  const rate = useRemote<RateStatus>('/api/rates/current');
  const [clientId, setClientId] = useState('');
  const clients = useClientDirectory(clientId);
  const [newClient, setNewClient] = useState(false);
  const [condition, setCondition] = useState<'cash' | 'credit'>('cash');
  const [basis, setBasis] = useState<'divisa' | 'bcv' | ''>('');
  const [date, setDate] = useState('');
  const [dateEdited, setDateEdited] = useState(false);
  const [due, setDue] = useState('');
  const [reminder, setReminder] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<SaleDraftLine[]>([emptySaleLine(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [paid, setPaid] = useState('0');
  const [addPayment, setAddPayment] = useState(false);
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>('usd_cash');
  const { currency, method } = paymentChoiceDetails(paymentChoice);
  const [restored, setRestored] = useState(false);
  const [reviewQuote, setReviewQuote] = useState<RateValue | null>(null);
  const [reviewInformation, setReviewInformation] = useState<RateValue | null>(null);
  const [reviewAttempted, setReviewAttempted] = useState(false);
  const reviewQuoteCurrent = useQuoteCurrent(reviewQuote);
  const [reviewTotals, setReviewTotals] = useState({ total: '0.00', balance: '0.00' });
  const [review, setReview] = useState<ReturnType<typeof manualSaleSchema.parse> | null>(null);
  const scope = session.environment + ':' + session.user.id;
  const command = useDurableCommercialCommand(scope, 'sale');
  const restoredCommandKey = useRef<string | null>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const draft = takeSaleDraft(scope);
    if (draft) {
      setClientId(draft.clientId);
      setCondition(draft.condition);
      setDate(draft.date);
      setDateEdited(draft.dateEdited);
      setDue(draft.due);
      setReminder(draft.reminder);
      setNotes(draft.notes);
      setLines(draft.lines);
      setNextKey(draft.nextKey);
      setPaid(draft.paid);
      setAddPayment(draft.addPayment);
      setPaymentChoice(draft.paymentChoice);
      setRestored(true);
      setBasis(draft.settlementBasis ?? '');
    } else {
      setDate(caracasDateTime());
      const requestedClient = new URL(window.location.href).searchParams.get('cliente');
      if (requestedClient && /^[a-f0-9-]{36}$/i.test(requestedClient)) setClientId(requestedClient);
    }
  }, [scope]);
  useEffect(() => {
    if (!command.pending || command.busy || restoredCommandKey.current === command.pending.key)
      return;
    const pending = command.pending;
    const saved = manualSaleSchema.parse(commercialCommandBody(pending));
    restoredCommandKey.current = pending.key;
    setClientId(saved.clientId);
    setBasis(saved.settlementBasis);
    setCondition(saved.condition);
    setReview(saved);
    setReviewAttempted(true);
    setReviewQuote(null);
    setReviewInformation(null);
    const total = saved.lines.reduce(
      (sum, line) =>
        sum.add(
          new Decimal(line.agreedUnitUsd)
            .mul(line.quantity)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        ),
      new Decimal(0),
    );
    setReviewTotals({
      total: pending.summary?.totalUsd ?? total.toFixed(2),
      balance: pending.summary?.balanceUsd ?? total.toFixed(2),
    });
    setRestored(true);
  }, [command.pending, command.busy]);
  const activeClients = clients.options.filter((client) => client.active);
  const configurations =
    catalog.data?.configurations.filter(
      (config) => session.environment !== 'production' || config.confirmationStatus === 'confirmed',
    ) ?? [];
  const ready = !!catalog.data && !!clients.data && !catalog.error;
  const total = lines.reduce((sum, line) => sum.plus(saleLineTotal(line)), new Decimal(0));
  const settlement = basis || null;
  const bcvCurrent = useQuoteCurrent(rate.data?.rate);
  const usdtCurrent = useQuoteCurrent(rate.data?.usdt?.rate);
  const quotes = {
    bcv: bcvCurrent && rate.data?.status === 'available',
    usdt: usdtCurrent && rate.data?.usdt?.status === 'available',
  };
  const paymentIssue = paymentChoiceUnavailable(paymentChoice, settlement, quotes);
  const quoteBasis =
    paymentChoice === 'ves_bcv' ? 'bcv' : paymentChoice === 'ves_usdt' ? 'divisa' : settlement;
  const activeRate = quoteBasis === 'divisa' ? rate.data?.usdt?.rate : rate.data?.rate;
  const rateAvailable = !paymentIssue && (quoteBasis === 'divisa' ? quotes.usdt : quotes.bcv);
  const received =
    condition === 'cash'
      ? currency === 'VES'
        ? activeRate && rateAvailable
          ? total.times(activeRate.rate).toFixed(2, Decimal.ROUND_HALF_UP)
          : ''
        : total.toFixed(2)
      : paid;
  let paidUsd = new Decimal(0);
  try {
    if (normalizedMoney(received)) {
      paidUsd = new Decimal(normalizedMoney(received));
      if (currency === 'VES')
        paidUsd =
          activeRate && rateAvailable
            ? new Decimal(
                paymentEquivalent(
                  paidUsd.toFixed(2),
                  activeRate,
                  quoteBasis ?? 'bcv',
                  total.gt(0) ? total.toFixed(2) : undefined,
                ),
              )
            : new Decimal(0);
    }
  } catch {}
  const balance = total.minus(paidUsd);
  const fullyPaid = total.gt(0) && balance.eq(0);
  let positivePayment = false;
  try {
    positivePayment = new Decimal(normalizedMoney(received) || 0).gt(0);
  } catch {}
  useEffect(() => {
    if (condition === 'cash' || fullyPaid) {
      setDue('');
      setReminder('');
    }
  }, [condition, fullyPaid]);
  const quantities = lines.reduce(
    (result, line) => {
      if (line.presentation && /^\d+$/.test(line.quantity) && line.configurationId)
        result[line.presentation] = (result[line.presentation] ?? 0) + Number(line.quantity);
      return result;
    },
    {} as Partial<Record<Presentation, number>>,
  );
  const hasCommercialUnits = lines.some(
    (line) =>
      configurations.find((config) => config.id === line.configurationId)?.commercialUnitLabel,
  );
  const quantityText = hasCommercialUnits
    ? `${Object.values(quantities).reduce((sum, count) => sum + (count ?? 0), 0)} unidades seleccionadas`
    : Object.entries(quantities)
        .map(
          ([presentation, count]) =>
            `${count} ${presentation === 'box' ? (count === 1 ? 'caja' : 'cajas') : presentation === 'half_box' ? (count === 1 ? 'media caja' : 'medias cajas') : count === 1 ? 'blíster' : 'blísteres'}`,
        )
        .join(' · ');
  function preserveDraft() {
    keepSaleDraft(scope, {
      clientId,
      settlementBasis: basis,
      condition,
      date,
      dateEdited,
      due,
      reminder,
      notes,
      lines,
      nextKey,
      paid,
      addPayment,
      paymentChoice,
    });
  }
  function changeCondition(value: 'cash' | 'credit') {
    setCondition(value);
    setDue('');
    setReminder('');
    setPaid('0');
    setAddPayment(false);
    setPaymentChoice('usd_cash');
    command.setError('');
  }
  function changeBasis(value: 'divisa' | 'bcv' | '') {
    setBasis(value);
    // The agreement changes only here, never when choosing cash/credit or a payment currency.
  }
  function update(key: number, changes: Partial<SaleDraftLine>) {
    const config = configurations.find(
      (item) =>
        item.id ===
        (changes.configurationId ?? lines.find((line) => line.key === key)?.configurationId),
    );
    setLines((current) => {
      const updated = current.map((line) => {
        if (line.key !== key) return line;
        return changeSaleLine(line, changes, config);
      });
      return updated;
    });
  }
  function stockIssue(line: SaleDraftLine) {
    if (!line.configurationId || !line.presentation || !availability.data) return '';
    const item = availability.data.items.find(
      (entry) =>
        entry.configurationId === line.configurationId && entry.presentation === line.presentation,
    );
    if (!item) return 'Esta presentación todavía no tiene existencias disponibles.';
    const requested = lines
      .filter(
        (other) =>
          other.configurationId === line.configurationId &&
          other.presentation === line.presentation,
      )
      .reduce((sum, other) => sum + (Number(other.quantity) || 0), 0);
    if (requested <= item.availableQuantity) return '';
    return (
      item.blockedReason ||
      `Hay ${item.availableQuantity} ${line.presentation === 'box' ? (configurations.find((config) => config.id === line.configurationId)?.commercialUnitLabel ?? 'cajas') : presentationNames[line.presentation].toLocaleLowerCase('es')} disponibles. Reduce la cantidad o registra una recepción.`
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
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
        const result = await command.run<SaleDetail>(review, {
          totalUsd: reviewTotals.total,
          balanceUsd: reviewTotals.balance,
        });
        clearSaleDraft();
        router.push('/ventas/' + result.id + '?guardada=1');
      } catch (error) {
        if (error instanceof CommercialJournalError && error.editable) setReviewAttempted(false);
      }
      return;
    }
    if (
      condition === 'credit' &&
      paid.trim() &&
      !/^\d{1,14}(\.\d{1,2})?$/.test(normalizedMoney(paid))
    ) {
      command.setError(
        'Escribe un abono válido, con hasta dos decimales, o deja 0 si pagará después.',
      );
      return;
    }
    if (!activeClients.some((client) => client.id === clientId)) {
      command.setError('Selecciona un cliente activo o crea uno para esta venta.');
      return;
    }
    if (!availability.data || availability.error) {
      command.setError('Actualiza las existencias antes de revisar la venta.');
      return;
    }
    for (const line of lines) {
      const config = configurations.find((item) => item.id === line.configurationId);
      if (!config) {
        command.setError('Selecciona el producto que vas a entregar.');
        return;
      }
      if (!basis) {
        command.setError(
          'Elige el acuerdo de cobro e indica el precio por unidad de cada producto.',
        );
        return;
      }
      const issue = stockIssue(line);
      if (issue) {
        command.setError(issue);
        return;
      }
    }
    if ((condition === 'cash' || positivePayment) && paymentIssue) {
      command.setError(paymentIssue);
      return;
    }
    if (
      currency === 'VES' &&
      (condition === 'cash' || positivePayment) &&
      (!activeRate || !rateAvailable)
    ) {
      command.setError(
        'La tasa correspondiente al precio pactado no está verificada. Puedes cobrar en USD o USDT.',
      );
      return;
    }
    if (paidUsd.gt(total)) {
      command.setError(
        'El cobro supera el total. Revisa el abono; no se aplicará el excedente a otra deuda.',
      );
      return;
    }
    if (condition === 'cash' && !paidUsd.eq(total)) {
      command.setError('Contado debe liquidar el total. Para un abono parcial, elige Crédito.');
      return;
    }
    let soldAt: string;
    const reviewedAt = new Date();
    try {
      soldAt = saleReviewInstant(date, dateEdited, reviewedAt);
    } catch (error) {
      command.setError(error instanceof Error ? error.message : 'Revisa la fecha de venta.');
      return;
    }
    const parsed = manualSaleSchema.safeParse({
      schemaVersion: 2,
      settlementBasis: basis,
      clientId,
      condition,
      soldAt,
      notes,
      dueDate: condition === 'credit' && balance.gt(0) && due ? due : null,
      reminderDate: condition === 'credit' && balance.gt(0) && reminder ? reminder : null,
      lines: lines.map((line) => ({
        configurationId: line.configurationId,
        presentation: line.presentation,
        quantity: Number(line.quantity),
        agreedUnitUsd: normalizedMoney(line.agreedUnitUsd),
      })),
      ...(positivePayment
        ? {
            initialPayment: {
              currency,
              amount: normalizedMoney(received),
              method,
              receivedAt: reviewedAt.toISOString(),
              ...(currency === 'VES' && activeRate ? { rateId: activeRate.id } : {}),
              ...(currency === 'USDT' && quotes.usdt && rate.data?.usdt?.rate
                ? { informationalUsdtRateId: rate.data.usdt.rate.id }
                : {}),
            },
          }
        : {}),
    });
    if (!parsed.success) {
      command.setError(parsed.error.issues[0]?.message ?? 'Revisa los datos de la venta.');
      return;
    }
    setReviewQuote(currency === 'VES' && activeRate ? { ...activeRate } : null);
    setReviewInformation(
      currency === 'USDT' && quotes.usdt && rate.data?.usdt?.rate
        ? { ...rate.data.usdt.rate }
        : null,
    );
    setReviewAttempted(false);
    setReviewTotals({ total: total.toFixed(2), balance: balance.toFixed(2) });
    setReview(parsed.data);
  }
  const basisChoices = [
    { value: 'divisa', label: 'Promoción / divisa' },
    { value: 'bcv', label: 'Regular / BCV' },
  ];
  return (
    <AppShell session={session} current="/ventas">
      <main id="app-main" className={'main-content operations-page ' + styles.salePage}>
        <Link className="back-link" href="/ventas">
          <ArrowLeft aria-hidden="true" />
          Ventas
        </Link>
        <div className="page-heading">
          <div>
            <h1>Nueva venta</h1>
            <p>Elige el cliente, agrega la mercancía y revisa el cobro.</p>
          </div>
        </div>
        {restored ? (
          <div className={styles.restored} role="status">
            <span>
              {command.pending
                ? 'Recuperamos una venta pendiente de confirmación. Conservamos sus datos originales.'
                : 'Recuperamos el borrador al volver. Revisa precios y existencias.'}
            </span>
            <Button type="button" variant="ghost" onClick={() => setRestored(false)}>
              Entendido
            </Button>
          </div>
        ) : null}
        {catalog.error ? (
          <LoadError error={catalog.error} retry={() => void catalog.reload()} />
        ) : null}
        {clients.error ? (
          <LoadError error={clients.error} retry={() => void clients.reload()} />
        ) : null}
        {availability.error ? (
          <LoadError error={availability.error} retry={() => void availability.reload()} />
        ) : null}
        {!ready && (catalog.loading || clients.loading) ? <LoadingRows /> : null}
        {ready ? (
          <form onSubmit={submit} className={styles.layout}>
            <fieldset
              disabled={
                command.busy || !command.ready || !!command.storageError || !!command.pending
              }
              className={styles.main}
            >
              <section className={styles.surface} aria-label="Cliente y condición de venta">
                <Field className={styles.customerSearch}>
                  <FieldLabel htmlFor="sale-client-search">Buscar cliente</FieldLabel>
                  <Input
                    id="sale-client-search"
                    type="search"
                    maxLength={120}
                    placeholder="Nombre, teléfono o RIF…"
                    value={clients.search}
                    onChange={(event) => clients.setSearch(event.target.value)}
                  />
                  <FieldDescription>
                    Busca en todos tus clientes. El cliente elegido se conserva al cambiar la
                    búsqueda.
                  </FieldDescription>
                </Field>
                <div className={styles.customer}>
                  <Field>
                    <FieldLabel htmlFor="sale-client">Cliente</FieldLabel>
                    <NativeSelect
                      id="sale-client"
                      required
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                    >
                      <option value="">Selecciona un cliente</option>
                      {activeClients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Button type="button" variant="outline" onClick={() => setNewClient(true)}>
                    <UserPlus aria-hidden="true" />
                    Nuevo cliente
                  </Button>
                </div>
                {clients.loading ? (
                  <p role="status" className={styles.lineHelp}>
                    Buscando clientes…
                  </p>
                ) : null}
                {clients.hasMore ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={clients.loading}
                    onClick={() => void clients.loadMore()}
                  >
                    Cargar más clientes
                  </Button>
                ) : null}
                {clients.selectedError ? (
                  <LoadError error={clients.selectedError} retry={clients.retrySelection} />
                ) : null}
                {!activeClients.length ? (
                  <p className={styles.lineHelp}>
                    {clients.search || clients.hasMore
                      ? 'No hay clientes activos entre estos resultados. Cambia la búsqueda o carga más clientes.'
                      : 'Crea el primer cliente con su nombre. WhatsApp es opcional.'}
                  </p>
                ) : null}
                <FieldSet className={styles.condition}>
                  <FieldLegend>Condición de venta</FieldLegend>
                  <div className={styles.segments}>
                    <label>
                      <input
                        type="radio"
                        name="sale-condition"
                        value="cash"
                        checked={condition === 'cash'}
                        onChange={() => changeCondition('cash')}
                      />
                      Contado
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="sale-condition"
                        value="credit"
                        checked={condition === 'credit'}
                        onChange={() => changeCondition('credit')}
                      />
                      Crédito
                    </label>
                  </div>
                </FieldSet>
              </section>
              <section className={styles.surface} aria-label="Productos de la venta">
                <div className={styles.productsHeader}>
                  <h2>Productos</h2>
                  <span>
                    {lines.length} {lines.length === 1 ? 'línea' : 'líneas'}
                  </span>
                </div>
                {!configurations.length ? (
                  <p className={styles.lineHelp}>
                    Aún no hay productos con empaque confirmado.{' '}
                    <Link href="/catalogo?returnTo=/ventas/nueva" onClick={preserveDraft}>
                      Agregar producto
                    </Link>
                    .
                  </p>
                ) : (
                  <>
                    {lines.map((line, index) => {
                      const config = configurations.find(
                        (item) => item.id === line.configurationId,
                      );
                      const allowed = config ? salePresentations(config) : [];
                      const stock = availability.data?.items.find(
                        (item) =>
                          item.configurationId === line.configurationId &&
                          item.presentation === line.presentation,
                      );
                      const issue = stockIssue(line);
                      return (
                        <section
                          key={line.key}
                          className={styles.line}
                          aria-labelledby={'sale-line-' + line.key}
                        >
                          <div className={styles.lineHeader}>
                            <h3 id={'sale-line-' + line.key}>Producto {index + 1}</h3>
                            <Button
                              variant="ghost"
                              size="icon"
                              type="button"
                              disabled={lines.length === 1}
                              aria-label={'Quitar producto ' + (index + 1)}
                              onClick={() =>
                                setLines((current) =>
                                  current.filter((item) => item.key !== line.key),
                                )
                              }
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </div>
                          <FieldGroup className={styles.lineFields}>
                            <Field className={styles.productField}>
                              <FieldLabel htmlFor={'sale-product-' + line.key}>Producto</FieldLabel>
                              <NativeSelect
                                id={'sale-product-' + line.key}
                                required
                                value={line.configurationId}
                                onChange={(event) =>
                                  update(line.key, { configurationId: event.target.value })
                                }
                              >
                                <option value="">Selecciona un producto</option>
                                {configurations.map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {productLabel(item)}
                                  </option>
                                ))}
                              </NativeSelect>
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={'sale-presentation-' + line.key}>
                                Presentación
                              </FieldLabel>
                              <NativeSelect
                                id={'sale-presentation-' + line.key}
                                required
                                value={line.presentation}
                                onChange={(event) =>
                                  update(line.key, {
                                    presentation: event.target.value as Presentation,
                                  })
                                }
                                disabled={!config || allowed.length === 1}
                              >
                                <option value="">Selecciona</option>
                                {allowed.map((presentation) => (
                                  <option key={presentation} value={presentation}>
                                    {presentation === 'box' && config?.commercialUnitLabel
                                      ? config.commercialUnitLabel
                                      : presentationNames[presentation]}
                                    {config?.boxWeightKg && presentation !== 'blister'
                                      ? ' · ' +
                                        new Decimal(config.boxWeightKg)
                                          .div(presentation === 'half_box' ? 2 : 1)
                                          .toString() +
                                        ' kg'
                                      : ''}
                                  </option>
                                ))}
                              </NativeSelect>
                            </Field>
                            <Field data-invalid={!!issue}>
                              <FieldLabel htmlFor={'sale-quantity-' + line.key}>
                                Cantidad
                              </FieldLabel>
                              <div className={styles.quantity}>
                                <Button
                                  type="button"
                                  variant="outline"
                                  aria-label={'Reducir cantidad del producto ' + (index + 1)}
                                  disabled={Number(line.quantity) <= 1}
                                  onClick={() =>
                                    update(line.key, {
                                      quantity: String(
                                        Math.max(1, (Number(line.quantity) || 1) - 1),
                                      ),
                                    })
                                  }
                                >
                                  <Minus aria-hidden="true" />
                                </Button>
                                <Input
                                  id={'sale-quantity-' + line.key}
                                  required
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  max={1000}
                                  step={1}
                                  value={line.quantity}
                                  aria-invalid={!!issue}
                                  aria-describedby={issue ? 'stock-' + line.key : undefined}
                                  onChange={(event) =>
                                    update(line.key, { quantity: event.target.value })
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  aria-label={'Aumentar cantidad del producto ' + (index + 1)}
                                  disabled={
                                    Number(line.quantity) >= 1000 ||
                                    (!!stock && Number(line.quantity) >= stock.availableQuantity)
                                  }
                                  onClick={() =>
                                    update(line.key, {
                                      quantity: String((Number(line.quantity) || 0) + 1),
                                    })
                                  }
                                >
                                  <Plus aria-hidden="true" />
                                </Button>
                              </div>
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={'sale-price-' + line.key}>
                                Precio por unidad (USD)
                              </FieldLabel>
                              <Input
                                id={'sale-price-' + line.key}
                                required
                                inputMode="decimal"
                                value={line.agreedUnitUsd}
                                onChange={(event) =>
                                  update(line.key, { agreedUnitUsd: event.target.value })
                                }
                              />
                            </Field>
                            <div className={styles.lineAmount}>
                              <span>Subtotal</span>
                              <strong>{displayMoney(saleLineTotal(line).toFixed(2))}</strong>
                            </div>
                          </FieldGroup>
                          {issue ? (
                            <p id={'stock-' + line.key} className={styles.error}>
                              {issue}{' '}
                              <Link
                                href={
                                  '/recepciones?producto=' +
                                  line.configurationId +
                                  '&returnTo=/ventas/nueva'
                                }
                                onClick={preserveDraft}
                              >
                                Registrar recepción
                              </Link>
                            </p>
                          ) : stock ? (
                            <p className={styles.lineHelp}>
                              Disponibles: {stock.availableQuantity}{' '}
                              {line.presentation &&
                                (line.presentation === 'box' && config?.commercialUnitLabel
                                  ? config.commercialUnitLabel
                                  : presentationNames[line.presentation].toLocaleLowerCase('es'))}
                              . Se comprueban de nuevo al confirmar.
                            </p>
                          ) : null}
                        </section>
                      );
                    })}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={lines.length >= 50}
                      onClick={() => {
                        setLines((current) => [...current, emptySaleLine(nextKey)]);
                        setNextKey((key) => key + 1);
                      }}
                    >
                      <Plus aria-hidden="true" />
                      Agregar producto
                    </Button>
                    <Field className={styles.agreement}>
                      <FieldLabel htmlFor="sale-basis">Acuerdo de cobro</FieldLabel>
                      <NativeSelect
                        id="sale-basis"
                        required
                        value={basis}
                        onChange={(event) => changeBasis(event.target.value as 'divisa' | 'bcv')}
                      >
                        <option value="">Elige el acuerdo con el cliente</option>
                        {basisChoices.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </NativeSelect>
                      <FieldDescription>
                        Se conserva al cobrar, aunque el pago sea después. No cambia los precios que
                        escribiste.
                      </FieldDescription>
                    </Field>
                  </>
                )}
              </section>
              <details className={styles.optional}>
                <summary>
                  Más opciones
                  <ChevronDown aria-hidden="true" />
                </summary>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="sale-date">Fecha y hora de venta en Venezuela</FieldLabel>
                    <Input
                      id="sale-date"
                      required
                      type="datetime-local"
                      value={date}
                      onChange={(event) => {
                        setDate(event.target.value);
                        setDateEdited(true);
                      }}
                    />
                    <FieldDescription>
                      {dateEdited
                        ? 'Se usará la fecha y hora que indicaste.'
                        : 'Se usará la hora actual al revisar la venta.'}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sale-notes">Observaciones de la venta</FieldLabel>
                    <Textarea
                      id="sale-notes"
                      maxLength={500}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </Field>
                  <p className={styles.muted}>
                    El comprobante conserva los productos entregados, el precio pactado y los pagos
                    recibidos.
                  </p>
                </FieldGroup>
              </details>
            </fieldset>
            <aside
              className={styles.surface + ' ' + styles.summary + ' ' + styles.payment}
              aria-label="Resumen y cobro"
            >
              <h2>{condition === 'cash' ? 'Cobrar venta' : 'Registrar crédito'}</h2>
              <dl>
                <div className={styles.total}>
                  <dt>Total a cobrar</dt>
                  <dd>
                    <output aria-label="Total de la venta">{displayMoney(total.toFixed(2))}</output>
                  </dd>
                </div>
              </dl>
              {quantityText ? <p className={styles.muted}>{quantityText}</p> : null}
              <fieldset
                disabled={
                  command.busy || !command.ready || !!command.storageError || !!command.pending
                }
                className={styles.payment}
              >
                {condition === 'credit' ? (
                  <label className={styles.paymentToggle}>
                    <input
                      type="checkbox"
                      checked={addPayment}
                      onChange={(event) => {
                        setAddPayment(event.target.checked);
                        if (!event.target.checked) {
                          setPaid('0');
                          setPaymentChoice('usd_cash');
                        }
                      }}
                    />
                    Registrar un abono ahora
                  </label>
                ) : null}
                {condition === 'credit' && addPayment ? (
                  <Field>
                    <FieldLabel htmlFor="sale-paid">Abono hoy (opcional) · {currency}</FieldLabel>
                    <Input
                      id="sale-paid"
                      inputMode="decimal"
                      value={paid}
                      onChange={(event) => setPaid(event.target.value)}
                      placeholder="0,00"
                    />
                    <FieldDescription>Deja 0 si el cliente pagará después.</FieldDescription>
                  </Field>
                ) : null}
                {condition === 'cash' || addPayment ? (
                  <PaymentMethodSelector
                    id="sale-method"
                    value={paymentChoice}
                    basis={settlement}
                    quotes={quotes}
                    onChange={(choice) => {
                      const next = paymentChoiceDetails(choice);
                      if (condition === 'credit' && (next.currency === 'VES' || currency === 'VES'))
                        setPaid('0');
                      setPaymentChoice(choice);
                    }}
                  />
                ) : null}
                {currency === 'VES' && (condition === 'cash' || addPayment) ? (
                  <>
                    <RateNotice rate={rate.data} basis={quoteBasis ?? undefined} />
                    <Button type="button" variant="outline" onClick={() => void rate.reload()}>
                      Actualizar tasa
                    </Button>
                  </>
                ) : null}
                {currency === 'USDT' && (condition === 'cash' || addPayment) ? (
                  <UsdtReference
                    amount={received}
                    quote={quotes.usdt ? (rate.data?.usdt?.rate ?? null) : null}
                  />
                ) : null}
                {condition === 'cash' ? (
                  <p className={styles.amountAuto}>
                    <span>Cobrar total</span>
                    <strong>
                      {received
                        ? displayMoney(received).replace(/^USD /, currency + ' ')
                        : 'Tasa no disponible'}
                    </strong>
                  </p>
                ) : null}
                {condition === 'credit' && !fullyPaid ? (
                  <div className={styles.dates}>
                    <Field>
                      <FieldLabel htmlFor="sale-due">Fecha acordada (opcional)</FieldLabel>
                      <div className={styles.shortcuts}>
                        <Button type="button" variant="outline" onClick={() => setDue('')}>
                          Sin fecha
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setDue(addCaracasDays(date.slice(0, 10) || caracasDate(), 7))
                          }
                        >
                          7 días
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setDue(addCaracasDays(date.slice(0, 10) || caracasDate(), 15))
                          }
                        >
                          15 días
                        </Button>
                      </div>
                      <Input
                        id="sale-due"
                        type="date"
                        value={due}
                        onChange={(event) => setDue(event.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="sale-reminder">Recordar cobrar (opcional)</FieldLabel>
                      <Input
                        id="sale-reminder"
                        type="date"
                        value={reminder}
                        onChange={(event) => setReminder(event.target.value)}
                      />
                      <FieldDescription>
                        Es un aviso para el negocio; no cambia la fecha acordada.
                      </FieldDescription>
                      {due ? (
                        <Button type="button" variant="ghost" onClick={() => setReminder(due)}>
                          Usar fecha acordada
                        </Button>
                      ) : null}
                      {reminder ? (
                        <Button type="button" variant="ghost" onClick={() => setReminder('')}>
                          Quitar recordatorio
                        </Button>
                      ) : null}
                    </Field>
                  </div>
                ) : null}
                {condition === 'credit' && fullyPaid ? (
                  <p role="status" className={styles.note}>
                    Con este abono queda pagada. No se guardarán fechas de cobranza ni
                    recordatorios.
                  </p>
                ) : null}
              </fieldset>
              {condition === 'credit' ? (
                <dl>
                  <div>
                    <dt>Abonado hoy</dt>
                    <dd>{displayMoney(paidUsd.toFixed(2))}</dd>
                  </div>
                  <div>
                    <dt>Saldo pendiente</dt>
                    <dd>
                      <output aria-label="Saldo pendiente">
                        {displayMoney(balance.toFixed(2))}
                      </output>
                    </dd>
                  </div>
                </dl>
              ) : null}
              <FormError message={command.storageError || (!review ? command.error : '')} />
              <SaveButton busy={command.busy}>
                {condition === 'cash' ? 'Revisar y cobrar' : 'Revisar y registrar crédito'}
              </SaveButton>
              <details className={styles.optional}>
                <summary>
                  Monedas y tasas
                  <ChevronDown aria-hidden="true" />
                </summary>
                <p className={styles.muted}>
                  USD y USDT conservan el importe pactado, 1:1. Bolívares requiere la tasa
                  correspondiente y un método habilitado.
                </p>
                <RateNotice rate={rate.data} basis={quoteBasis ?? undefined} />
                <Button type="button" variant="outline" onClick={() => void rate.reload()}>
                  Actualizar tasas
                </Button>
              </details>
            </aside>
          </form>
        ) : null}
        <PageFooter />
        {newClient ? (
          <ClientDialog
            onClose={() => setNewClient(false)}
            onSaved={async (client) => {
              clients.remember(client);
              setClientId(client.id);
              setNewClient(false);
              await clients.reload();
            }}
          />
        ) : null}
        <Dialog
          open={!!review}
          onOpenChange={(open) => {
            if (!open && !command.busy && !reviewAttempted) setReview(null);
          }}
        >
          <DialogContent className="catalog-dialog">
            <DialogHeader>
              <DialogTitle>Confirmar venta</DialogTitle>
              <DialogDescription>
                Revisa la mercancía y el cobro. Al confirmar se descontará del inventario.
              </DialogDescription>
            </DialogHeader>
            {review ? (
              <form onSubmit={submit} className={styles.review}>
                <p>
                  <strong>
                    {activeClients.find((client) => client.id === review.clientId)?.name ??
                      'Cliente de la solicitud pendiente'}
                  </strong>
                  <small>
                    {review.condition === 'cash' ? 'Contado' : 'Crédito'} ·{' '}
                    {basisChoices.find((choice) => choice.value === basis)?.label}
                  </small>
                </p>
                <ul>
                  {review.lines.map((line, index) => (
                    <li key={index}>
                      <span>
                        <strong>
                          {configurations.some((config) => config.id === line.configurationId)
                            ? productLabel(
                                configurations.find(
                                  (config) => config.id === line.configurationId,
                                )!,
                              )
                            : 'Producto de la solicitud pendiente'}
                        </strong>
                        <small>
                          {line.quantity}{' '}
                          {line.presentation === 'box'
                            ? (configurations.find((config) => config.id === line.configurationId)
                                ?.commercialUnitLabel ?? presentationNames.box)
                            : presentationNames[line.presentation]}{' '}
                          × {displayMoney(line.agreedUnitUsd)}
                        </small>
                      </span>
                      <strong>
                        {displayMoney(
                          new Decimal(line.agreedUnitUsd)
                            .times(line.quantity)
                            .toFixed(2, Decimal.ROUND_HALF_UP),
                        )}
                      </strong>
                    </li>
                  ))}
                </ul>
                <dl>
                  <div className={styles.reviewTotal}>
                    <dt>Total</dt>
                    <dd>{displayMoney(reviewTotals.total)}</dd>
                  </div>
                  <div>
                    <dt>{review.condition === 'cash' ? 'Cobro' : 'Abono hoy'}</dt>
                    <dd>
                      {review.initialPayment
                        ? displayMoney(review.initialPayment.amount).replace(
                            /^USD /,
                            review.initialPayment.currency + ' ',
                          )
                        : 'Sin abono'}
                    </dd>
                  </div>
                  {review.initialPayment ? (
                    <div>
                      <dt>Método</dt>
                      <dd>{paymentMethodLabel(review.initialPayment.method)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Saldo pendiente</dt>
                    <dd>{displayMoney(reviewTotals.balance)}</dd>
                  </div>
                  {review.dueDate ? (
                    <div>
                      <dt>Fecha acordada</dt>
                      <dd>{review.dueDate}</dd>
                    </div>
                  ) : null}
                  {review.reminderDate ? (
                    <div>
                      <dt>Recordar cobrar</dt>
                      <dd>{review.reminderDate}</dd>
                    </div>
                  ) : null}
                </dl>
                {reviewQuote ? (
                  <p>
                    <RateSnapshot quote={reviewQuote} basis={quoteBasis ?? 'bcv'} />
                  </p>
                ) : null}
                <p className={styles.muted}>
                  Comprobante comercial. No es una factura fiscal SENIAT.
                </p>
                {review.initialPayment?.currency === 'USDT' ? (
                  <UsdtReference
                    amount={review.initialPayment.amount}
                    quote={reviewInformation}
                    frozen
                  />
                ) : null}
                {reviewAttempted && command.error ? (
                  <p role="status">
                    La confirmación sigue pendiente. Reintenta con estos mismos datos para consultar
                    o completar la venta sin duplicarla.
                  </p>
                ) : null}
                {command.pending ? (
                  <p role="status">
                    Solicitud conservada en este dispositivo. Confirmar recupera o completa esta
                    misma venta, incluso si cambió el inventario o venció la cotización. No cambies
                    sus datos.
                  </p>
                ) : null}
                <FormError message={command.storageError || command.error} />
                {command.authNeeded ? (
                  <Link href="/login">Iniciar sesión para recuperar esta venta</Link>
                ) : null}
                <div className="form-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={command.busy || reviewAttempted}
                    onClick={() => setReview(null)}
                  >
                    Volver a editar
                  </Button>
                  <Button
                    type="submit"
                    disabled={command.busy || !command.ready || !!command.storageError}
                  >
                    {command.busy ? 'Guardando…' : 'Confirmar venta'}
                  </Button>
                </div>
              </form>
            ) : null}
          </DialogContent>
        </Dialog>
      </main>
    </AppShell>
  );
}
