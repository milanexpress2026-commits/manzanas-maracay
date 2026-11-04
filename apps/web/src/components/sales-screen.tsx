'use client';
import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';
import {
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  ArrowLeft,
  ArrowRight,
  UserPlus,
  Info,
  FileText,
} from 'lucide-react';
import {
  saleSchema,
  type SaleSummary,
  type SaleDetail,
  type Catalog,
  type Configuration,
  type ClientSummary,
  type Presentation,
  type PriceBasis,
} from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { NativeSelect } from './ui/native-select';
import { Field, FieldLabel, FieldDescription } from './ui/field';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { LoadError, LoadingRows, PageFooter, FormError, SaveButton } from './operations-ui';
import { ClientDialog, SaleTable, RateNotice, type RateStatus } from './commercial-shared';
import { useRemote, useCommand, displayMoney } from '@/lib/inventory-api';
import {
  productLabel,
  presentationNames,
  normalizedMoney,
  caracasDateTime,
  caracasInstant,
  caracasDate,
  addCaracasDays,
} from '@/lib/commercial-ui';
type DraftLine = {
  key: number;
  configurationId: string;
  presentation: Presentation | '';
  quantity: string;
  priceBasis: PriceBasis | '';
  agreedUnitUsd: string;
};
const blank = (key: number): DraftLine => ({
  key,
  configurationId: '',
  presentation: '',
  quantity: '1',
  priceBasis: '',
  agreedUnitUsd: '',
});
function availablePresentations(config: Configuration) {
  return config.allowedPresentations.filter(
    (p) =>
      p === 'box' ||
      (p === 'blister'
        ? config.blistersPerBox !== null
        : config.halfPreparation !== 'pending' && config.halfPreparation !== 'none'),
  );
}
function reference(config: Configuration | undefined, line: DraftLine) {
  const price = config?.prices.find((p) => p.presentation === line.presentation);
  return line.priceBasis === 'usd_cash_promo'
    ? price?.promoUsd
    : line.priceBasis === 'ves_regular'
      ? price?.regularUsd
      : null;
}
export function SalesScreen({ session }: { session: AppSession }) {
  const sales = useRemote<SaleSummary[]>('/api/sales?limit=200');
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
                  <p>
                    Selecciona cliente y productos. El costo y la salida de inventario se asignan
                    por antigüedad.
                  </p>
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
  const router = useRouter(),
    catalog = useRemote<Catalog>('/api/catalog'),
    clients = useRemote<ClientSummary[]>('/api/clients?limit=200'),
    rate = useRemote<RateStatus>('/api/rates/current');
  const [clientId, setClientId] = useState(''),
    [newClient, setNewClient] = useState(false),
    [condition, setCondition] = useState<'cash' | 'credit'>('cash'),
    [date, setDate] = useState(''),
    [due, setDue] = useState(''),
    [reminder, setReminder] = useState(''),
    [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([blank(1)]),
    [nextKey, setNextKey] = useState(2);
  const [paid, setPaid] = useState(''),
    [currency, setCurrency] = useState<'USD' | 'VES'>('USD'),
    [method, setMethod] = useState('Efectivo');
  const [review, setReview] = useState<ReturnType<typeof saleSchema.parse> | null>(null);
  const command = useCommand();
  useEffect(() => setDate(caracasDateTime()), []);
  const ready = !!catalog.data && !!clients.data && !catalog.error && !clients.error;
  const activeClients = clients.data?.filter((c) => c.active) ?? [];
  let total = new Decimal(0),
    referenceTotal = new Decimal(0);
  for (const line of lines) {
    try {
      if (line.agreedUnitUsd && /^\d+$/.test(line.quantity))
        total = total.plus(
          new Decimal(normalizedMoney(line.agreedUnitUsd))
            .times(line.quantity)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        );
      const ref = reference(
        catalog.data?.configurations.find((c) => c.id === line.configurationId),
        line,
      );
      if (ref != null && /^\d+$/.test(line.quantity))
        referenceTotal = referenceTotal.plus(
          new Decimal(ref).times(line.quantity).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        );
    } catch {}
  }
  let paidUsd = new Decimal(0);
  try {
    if (paid)
      paidUsd =
        currency === 'USD'
          ? new Decimal(normalizedMoney(paid))
          : rate.data?.status === 'available' && rate.data.rate
            ? new Decimal(normalizedMoney(paid))
                .div(rate.data.rate.rate)
                .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
            : new Decimal(0);
  } catch {}
  function update(key: number, changes: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...changes },
          config = catalog.data?.configurations.find((c) => c.id === next.configurationId);
        if (changes.configurationId !== undefined) {
          const allowed = config ? availablePresentations(config) : [];
          next.presentation = allowed.length === 1 ? allowed[0] : '';
        }
        if (
          changes.configurationId !== undefined ||
          changes.presentation !== undefined ||
          changes.priceBasis !== undefined
        )
          next.agreedUnitUsd = reference(config, next) ?? '';
        return next;
      }),
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    command.setError('');
    if (review) {
      try {
        const result = await command.run<SaleDetail>('/api/sales', review);
        router.push('/ventas/' + result.id);
      } catch {}
      return;
    }
    let soldAt: string;
    try {
      soldAt = caracasInstant(date);
    } catch (e) {
      command.setError(e instanceof Error ? e.message : 'Revisa la fecha.');
      return;
    }
    let withPayment = false;
    try {
      withPayment = paid.trim() !== '' && !new Decimal(normalizedMoney(paid)).isZero();
    } catch {
      command.setError('Revisa el monto pagado.');
      return;
    }
    const parsed = saleSchema.safeParse({
      clientId,
      condition,
      soldAt,
      dueDate: condition === 'credit' && due ? due : null,
      reminderDate: reminder || null,
      notes,
      lines: lines.map((l) => ({
        configurationId: l.configurationId,
        presentation: l.presentation,
        quantity: Number(l.quantity),
        priceBasis: l.priceBasis,
        agreedUnitUsd: normalizedMoney(l.agreedUnitUsd),
      })),
      ...(withPayment
        ? {
            initialPayment: { currency, amount: normalizedMoney(paid), method, receivedAt: soldAt },
          }
        : {}),
    });
    if (!parsed.success) {
      command.setError(parsed.error.issues[0]?.message ?? 'Revisa los datos de la venta.');
      return;
    }
    if (
      lines.some(
        (l) =>
          reference(
            catalog.data?.configurations.find((c) => c.id === l.configurationId),
            l,
          ) == null,
      )
    ) {
      command.setError(
        'Configura el precio de referencia de cada presentación antes de vender. Puedes hacerlo en Catálogo.',
      );
      return;
    }
    if (withPayment && currency === 'VES' && rate.data?.status !== 'available') {
      command.setError(
        'No hay BCV vigente verificado para recibir VES. La venta a crédito sin pago puede continuar.',
      );
      return;
    }
    if (paidUsd.gt(total)) {
      command.setError(
        'El pago inicial supera la venta. Revisa el monto; no se aplicará el excedente automáticamente.',
      );
      return;
    }
    if (condition === 'cash' && !paidUsd.eq(total)) {
      command.setError(
        'Para registrar un pago parcial o cero, elige Crédito. Contado requiere el pago completo.',
      );
      return;
    }
    setReview(parsed.data);
  }
  return (
    <AppShell session={session} current="/ventas">
      <main id="app-main" className="main-content operations-page">
        <Link className="back-link" href="/ventas">
          <ArrowLeft aria-hidden="true" />
          Ventas
        </Link>
        <div className="page-heading">
          <div>
            <h1>Nueva venta</h1>
            <p>Selecciona los productos; la mercancía más antigua se asigna automáticamente.</p>
          </div>
        </div>
        {catalog.error ? (
          <LoadError error={catalog.error} retry={() => void catalog.reload()} />
        ) : null}
        {clients.error ? (
          <LoadError error={clients.error} retry={() => void clients.reload()} />
        ) : null}
        {!ready && (catalog.loading || clients.loading) ? <LoadingRows /> : null}
        {ready ? (
          <form onSubmit={submit} className="commercial-layout">
            <div>
              <fieldset disabled={command.busy}>
                <section className="operations-panel commercial-form-panel">
                  <h2 className="commercial-section-title">
                    <ShoppingCart aria-hidden="true" />
                    Datos de la venta
                  </h2>
                  <div className="commercial-form-grid">
                    <Field className="full-width">
                      <FieldLabel htmlFor="sale-client">Cliente</FieldLabel>
                      <div className="inline-actions">
                        <NativeSelect
                          id="sale-client"
                          required
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                        >
                          <option value="">Selecciona un cliente</option>
                          {activeClients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </NativeSelect>
                        <Button type="button" variant="outline" onClick={() => setNewClient(true)}>
                          <UserPlus aria-hidden="true" />
                          Nuevo cliente
                        </Button>
                      </div>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="sale-date">
                        Fecha y hora de venta en Venezuela
                      </FieldLabel>
                      <Input
                        id="sale-date"
                        required
                        type="datetime-local"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="sale-condition">Condición de venta</FieldLabel>
                      <NativeSelect
                        id="sale-condition"
                        value={condition}
                        onChange={(e) => setCondition(e.target.value as 'cash' | 'credit')}
                      >
                        <option value="cash">Contado</option>
                        <option value="credit">Crédito</option>
                      </NativeSelect>
                      <FieldDescription>
                        Crédito permite retirar sin pagar o con un abono parcial.
                      </FieldDescription>
                    </Field>
                    {condition === 'credit' ? (
                      <Field>
                        <FieldLabel htmlFor="sale-due">Fecha de pago pactada, opcional</FieldLabel>
                        <Input
                          id="sale-due"
                          type="date"
                          value={due}
                          onChange={(e) => setDue(e.target.value)}
                        />
                        <div className="date-shortcuts">
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() =>
                              setDue(addCaracasDays(date.slice(0, 10) || caracasDate(), 7))
                            }
                          >
                            7 días
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            type="button"
                            onClick={() =>
                              setDue(addCaracasDays(date.slice(0, 10) || caracasDate(), 15))
                            }
                          >
                            15 días
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            type="button"
                            onClick={() => setDue('')}
                          >
                            Sin fecha
                          </Button>
                        </div>
                      </Field>
                    ) : null}
                    <Field>
                      <FieldLabel htmlFor="sale-reminder">
                        Recordatorio interno, opcional
                      </FieldLabel>
                      <Input
                        id="sale-reminder"
                        type="date"
                        value={reminder}
                        onChange={(e) => setReminder(e.target.value)}
                      />
                      <FieldDescription>
                        Recordar llamar no implica que el cliente haya prometido pagar ese día.
                      </FieldDescription>
                    </Field>
                  </div>
                </section>
                <section aria-label="Productos de la venta">
                  <h2 className="commercial-section-title">Productos</h2>
                  {lines.map((line, index) => {
                    const config = catalog.data!.configurations.find(
                        (c) => c.id === line.configurationId,
                      ),
                      allowed = config ? availablePresentations(config) : [];
                    const ref = reference(config, line);
                    return (
                      <section
                        key={line.key}
                        className="commercial-line"
                        aria-labelledby={'sale-line-' + line.key}
                      >
                        <div className="commercial-line-header">
                          <h3 id={'sale-line-' + line.key}>Producto {index + 1}</h3>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            disabled={lines.length === 1}
                            aria-label={'Quitar producto ' + (index + 1)}
                            onClick={() =>
                              setLines((current) => current.filter((l) => l.key !== line.key))
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        <div className="commercial-line-fields">
                          <Field className="line-product">
                            <FieldLabel htmlFor={'sale-product-' + line.key}>Producto</FieldLabel>
                            <NativeSelect
                              id={'sale-product-' + line.key}
                              required
                              value={line.configurationId}
                              onChange={(e) =>
                                update(line.key, { configurationId: e.target.value })
                              }
                            >
                              <option value="">Selecciona un producto</option>
                              {catalog.data!.configurations.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {productLabel(c)}
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
                              onChange={(e) =>
                                update(line.key, { presentation: e.target.value as Presentation })
                              }
                              disabled={!config || allowed.length === 1}
                            >
                              <option value="">Selecciona</option>
                              {allowed.map((p) => (
                                <option key={p} value={p}>
                                  {presentationNames[p]}
                                  {config?.boxWeightKg && p !== 'blister'
                                    ? ' · ' +
                                      new Decimal(config.boxWeightKg)
                                        .div(p === 'half_box' ? 2 : 1)
                                        .toString() +
                                      ' kg'
                                    : ''}
                                </option>
                              ))}
                            </NativeSelect>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor={'sale-quantity-' + line.key}>Cantidad</FieldLabel>
                            <Input
                              id={'sale-quantity-' + line.key}
                              required
                              type="number"
                              inputMode="numeric"
                              min={1}
                              max={1000}
                              step={1}
                              value={line.quantity}
                              onChange={(e) => update(line.key, { quantity: e.target.value })}
                            />
                          </Field>
                          <Field className="line-wide">
                            <FieldLabel htmlFor={'sale-basis-' + line.key}>
                              Referencia comercial
                            </FieldLabel>
                            <NativeSelect
                              id={'sale-basis-' + line.key}
                              required
                              value={line.priceBasis}
                              onChange={(e) =>
                                update(line.key, { priceBasis: e.target.value as PriceBasis })
                              }
                            >
                              <option value="">Elige una referencia</option>
                              <option value="usd_cash_promo">Promocional USD efectivo</option>
                              <option value="ves_regular">Normal USD para cobro VES</option>
                            </NativeSelect>
                          </Field>
                          <Field className="line-wide">
                            <FieldLabel htmlFor={'sale-price-' + line.key}>
                              Precio unitario pactado (USD)
                            </FieldLabel>
                            <Input
                              id={'sale-price-' + line.key}
                              required
                              inputMode="decimal"
                              value={line.agreedUnitUsd}
                              onChange={(e) => update(line.key, { agreedUnitUsd: e.target.value })}
                            />
                          </Field>
                        </div>
                        <div className="commercial-line-summary">
                          <span>
                            Referencia:{' '}
                            <strong>{ref != null ? displayMoney(ref) : 'Sin configurar'}</strong>
                          </span>
                          <span>El precio pactado no cambia la lista general.</span>
                        </div>
                        {config?.halfPreparation === 'pending' ? (
                          <p className="commercial-help">
                            La preparación de medias cajas está pendiente de confirmar para este
                            producto.
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
                      setLines((current) => [...current, blank(nextKey)]);
                      setNextKey((k) => k + 1);
                    }}
                  >
                    <Plus aria-hidden="true" />
                    Agregar producto
                  </Button>
                </section>
                <section className="operations-panel commercial-form-panel">
                  <h2 className="commercial-section-title">Pago inicial</h2>
                  <p className="commercial-help">
                    Deja el monto vacío o en cero si la venta queda totalmente a crédito. No se crea
                    un abono de cero.
                  </p>
                  <div className="commercial-form-grid">
                    <Field>
                      <FieldLabel htmlFor="sale-currency">Moneda del pago inicial</FieldLabel>
                      <NativeSelect
                        id="sale-currency"
                        value={currency}
                        onChange={(e) => {
                          setCurrency(e.target.value as 'USD' | 'VES');
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
                      <FieldLabel htmlFor="sale-paid">Monto pagado</FieldLabel>
                      <Input
                        id="sale-paid"
                        inputMode="decimal"
                        value={paid}
                        onChange={(e) => setPaid(e.target.value)}
                        placeholder="0,00"
                      />
                      {currency === 'USD' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => setPaid(total.toFixed(2))}
                        >
                          Pagar total en USD
                        </Button>
                      ) : null}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="sale-method">Método del pago inicial</FieldLabel>
                      <Input
                        id="sale-method"
                        value={method}
                        maxLength={80}
                        onChange={(e) => setMethod(e.target.value)}
                      />
                    </Field>
                  </div>
                  <RateNotice rate={rate.data} />
                  <Field>
                    <FieldLabel htmlFor="sale-notes">Observaciones de la venta</FieldLabel>
                    <Textarea
                      id="sale-notes"
                      maxLength={500}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </Field>
                </section>
              </fieldset>
            </div>
            <aside className="commercial-summary">
              <h2>Resumen de la venta</h2>
              <dl>
                <div>
                  <dt>Referencia</dt>
                  <dd>{displayMoney(referenceTotal.toFixed(2))}</dd>
                </div>
                <div>
                  <dt>Descuento negociado</dt>
                  <dd>{displayMoney(referenceTotal.minus(total).toFixed(2))}</dd>
                </div>
                <div className="summary-total">
                  <dt>Total pactado</dt>
                  <dd>{displayMoney(total.toFixed(2))}</dd>
                </div>
                <div>
                  <dt>Pago inicial equivalente</dt>
                  <dd>{displayMoney(paidUsd.toFixed(2))}</dd>
                </div>
                <div>
                  <dt>Saldo pendiente</dt>
                  <dd>{displayMoney(total.minus(paidUsd).toFixed(2))}</dd>
                </div>
              </dl>
              <p>
                El costo FIFO y la ganancia bruta se calculan al confirmar, con los lotes realmente
                asignados.
              </p>
              <FormError message={!review ? command.error : ''} />
              <SaveButton busy={command.busy}>Revisar venta</SaveButton>
              <p>Confirmar registra el comprobante, el egreso y el pago inicial juntos.</p>
            </aside>
          </form>
        ) : null}
        <PageFooter />
        {newClient ? (
          <ClientDialog
            onClose={() => setNewClient(false)}
            onSaved={async (c) => {
              await clients.reload();
              setClientId(c.id);
              setNewClient(false);
            }}
          />
        ) : null}
        <Dialog
          open={!!review}
          onOpenChange={(open) => {
            if (!open && !command.busy) setReview(null);
          }}
        >
          <DialogContent className="catalog-dialog">
            <DialogHeader>
              <DialogTitle>Confirmar venta</DialogTitle>
              <DialogDescription>
                Revisa la mercancía que se entrega. Al confirmar se descontará del inventario.
              </DialogDescription>
            </DialogHeader>
            {review ? (
              <form onSubmit={submit}>
                <div className="receipt-review">
                  <p>
                    <strong>{clients.data?.find((c) => c.id === review.clientId)?.name}</strong> ·{' '}
                    {review.condition === 'cash' ? 'Contado' : 'Crédito'}
                  </p>
                  <ul>
                    {review.lines.map((line, i) => (
                      <li key={i}>
                        <strong>
                          {productLabel(
                            catalog.data!.configurations.find(
                              (c) => c.id === line.configurationId,
                            )!,
                          )}
                        </strong>
                        <span>
                          {line.quantity} {presentationNames[line.presentation]} ·{' '}
                          {displayMoney(line.agreedUnitUsd)} por presentación
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p>
                    Total <strong>{displayMoney(total.toFixed(2))}</strong> · Saldo{' '}
                    {displayMoney(total.minus(paidUsd).toFixed(2))}
                  </p>
                  <p>Se emite un comprobante comercial. No es una factura fiscal SENIAT.</p>
                </div>
                <FormError message={command.error} />
                <div className="form-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={command.busy}
                    onClick={() => setReview(null)}
                  >
                    Volver a editar
                  </Button>
                  <SaveButton busy={command.busy}>Confirmar venta</SaveButton>
                </div>
              </form>
            ) : null}
          </DialogContent>
        </Dialog>
      </main>
    </AppShell>
  );
}
