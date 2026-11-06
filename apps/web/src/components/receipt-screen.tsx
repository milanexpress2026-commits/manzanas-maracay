'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ZodError } from 'zod';
import { Plus, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import {
  quickReceiptSchema,
  simpleReceiptSchema,
  type Catalog,
  type HabitualCatalogOption,
  type HabitualCatalogOptions,
  type ReceiptResult,
  type Supplier,
} from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { HabitualProductPicker } from './habitual-product-picker';
import { ReceiptQuickLine } from './receipt-quick-line';
import { ReceiptExceptionalCaliber } from './receipt-exceptional-caliber';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { NativeSelect } from './ui/native-select';
import { Field, FieldLabel } from './ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { FormError, LoadError, LoadingRows, PageFooter } from './operations-ui';
import { readApi, useRemote, displayDate } from '@/lib/inventory-api';
import { caracasDateTime } from '@/lib/commercial-ui';
import {
  buildQuickReceipt,
  emptyReceiptDraft,
  pickerOptions,
  receiptDraftSchema,
  receiptLine,
  type QuickLine,
  type ReceiptDraft,
} from '@/lib/receipt-flow';
import {
  createPendingReceipt,
  canEditAfterReceiptResponse,
  deviceScope,
  readPreferences,
  rememberProducts,
  writePreferences,
  verifyPendingReceipt,
  RECEIPT_STORAGE_PREFIX,
  type PendingReceipt,
} from '@/lib/receipt-storage';
import styles from './receipt-quick.module.css';

export function ReceiptScreen({
  session,
  initialConfigurationId = '',
  initialOptionKey = '',
  returnToSale = false,
}: {
  session: AppSession;
  initialConfigurationId?: string;
  initialOptionKey?: string;
  returnToSale?: boolean;
}) {
  const scope = deviceScope(session.environment, session.user.id);
  const storageKey = RECEIPT_STORAGE_PREFIX + scope;
  const options = useRemote<HabitualCatalogOptions>('/api/catalog/options');
  const catalog = useRemote<Catalog>('/api/catalog');
  const [draft, setDraft] = useState<ReceiptDraft>(() => emptyReceiptDraft(scope));
  const draftRef = useRef(draft);
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [error, setError] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [picker, setPicker] = useState<'new' | string | null>(null);
  const [review, setReview] = useState(false);
  const [saved, setSaved] = useState<{ result: ReceiptResult; draft: ReceiptDraft } | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [supplierError, setSupplierError] = useState('');
  const initialApplied = useRef(false);
  const ready = hydrated && !!options.data && !!catalog.data && !options.error && !catalog.error;
  const locked = busy || !!draft.pending;
  const mutate = (fn: (current: ReceiptDraft) => ReceiptDraft) =>
    setDraft((current) => {
      const next = fn(current);
      draftRef.current = next;
      return next;
    });
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = receiptDraftSchema.safeParse(JSON.parse(raw));
          if (!parsed.success || parsed.data.scope !== scope)
            throw new Error(
              'No se pudo leer el borrador de este acceso. Conserva esta pantalla y consulta antes de iniciar otra recepción si habías pulsado Guardar.',
            );
          if (parsed.data.pending && !(await verifyPendingReceipt(parsed.data.pending)))
            throw new Error(
              'No se pudo verificar la confirmación pendiente. No se enviará otra recepción.',
            );
          if (!cancelled) {
            draftRef.current = parsed.data;
            setDraft(parsed.data);
            setRestored(parsed.data.lines.length > 0);
            setReview(!!parsed.data.pending);
          }
        }
      } catch (reason) {
        if (!cancelled)
          setStorageError(
            reason instanceof Error
              ? reason.message
              : 'El dispositivo no pudo recuperar el borrador.',
          );
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [scope, storageKey]);
  useEffect(() => {
    if (!hydrated || storageError) return;
    try {
      if (draft.lines.length) localStorage.setItem(storageKey, JSON.stringify(draft));
      else localStorage.removeItem(storageKey);
    } catch {
      setStorageError(
        'No se pudo conservar el borrador en este dispositivo. Revisa el almacenamiento del navegador antes de guardar.',
      );
    }
  }, [draft, hydrated, storageKey, storageError]);
  useEffect(() => {
    if (!ready || !options.data || initialApplied.current) return;
    initialApplied.current = true;
    const selected = options.data.options.find((option) =>
      initialOptionKey
        ? option.optionKey === initialOptionKey
        : initialConfigurationId && option.configurationId === initialConfigurationId,
    );
    if (selected && !draftRef.current.lines.length) {
      const line = receiptLine(
        selected,
        catalog.data?.configurations.find((item) => item.id === selected.configurationId),
      );
      mutate((current) => ({ ...current, lines: [line] }));
    } else if ((initialOptionKey || initialConfigurationId) && !selected)
      setError('El producto del enlace ya no está disponible. Elige uno de las opciones actuales.');
  }, [ready, options.data, catalog.data, initialOptionKey, initialConfigurationId]);
  async function loadSuppliers() {
    try {
      setSuppliers(await readApi<Supplier[]>('/api/suppliers'));
      setSupplierError('');
    } catch {
      setSupplierError(
        'No se pudieron consultar los proveedores. Puedes recibir sin indicar proveedor.',
      );
    }
  }
  function choose(optionKey: string) {
    const option = options.data?.options.find((item) => item.optionKey === optionKey);
    if (!option || locked) return;
    const line = receiptLine(
      option,
      catalog.data?.configurations.find((item) => item.id === option.configurationId),
    );
    mutate((current) => ({
      ...current,
      lines:
        picker && picker !== 'new'
          ? current.lines.map((item) =>
              item.key === picker
                ? {
                    ...line,
                    key: item.key,
                    boxes: item.boxes,
                    ...(item.optionKey === line.optionKey
                      ? {
                          notes: item.notes,
                        }
                      : {}),
                  }
                : item,
            )
          : [...current.lines, line],
    }));
    setPicker(null);
    setError('');
  }
  function updateLine(line: QuickLine) {
    if (!locked)
      mutate((current) => ({
        ...current,
        lines: current.lines.map((item) => (item.key === line.key ? line : item)),
      }));
  }
  function inspect(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      buildQuickReceipt(draft, options.data?.options ?? []);
      setReview(true);
    } catch (reason) {
      setError(
        reason instanceof ZodError
          ? (reason.issues[0]?.message ?? 'Revisa la recepción.')
          : reason instanceof Error
            ? reason.message
            : 'Revisa los productos y las cantidades.',
      );
    }
  }
  async function confirm() {
    if (inFlight.current || storageError) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    let pending = draftRef.current.pending;
    try {
      if (!pending)
        pending = await createPendingReceipt(
          buildQuickReceipt(draftRef.current, options.data?.options ?? []),
        );
      if (!(await verifyPendingReceipt(pending)))
        throw new Error('No se pudo verificar la recepción pendiente.');
      const body = JSON.parse(pending.body);
      (body.schemaVersion === 3 ? simpleReceiptSchema : quickReceiptSchema).parse(body);
      const submitting = { ...draftRef.current, pending };
      // Persist before sending. A lost response keeps the exact command across a reload.
      localStorage.setItem(storageKey, JSON.stringify(submitting));
      mutate(() => submitting);
      const response = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.key },
        body: pending.body,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) setAuthNeeded(true);
        if (canEditAfterReceiptResponse(response.status)) {
          const editable = { ...submitting, pending: null };
          localStorage.setItem(storageKey, JSON.stringify(editable));
          mutate(() => editable);
          if (response.status === 409) {
            void options.reload();
            void catalog.reload();
          }
        }
        throw new Error(
          typeof result?.message === 'string'
            ? result.message
            : 'No se recibió confirmación del servidor. Reintenta esta misma recepción.',
        );
      }
      if (
        !result?.purchaseId ||
        !Array.isArray(result.lots) ||
        result.lots.length !== submitting.lines.length
      )
        throw new Error(
          'La respuesta no permite confirmar la recepción. Reintenta con la misma clave.',
        );
      setSaved({ result, draft: submitting });
      setReview(false);
      localStorage.removeItem(storageKey);
      try {
        writePreferences(
          localStorage,
          scope,
          rememberProducts(
            readPreferences(localStorage, scope),
            submitting.lines.map((line) => line.optionKey),
          ),
        );
      } catch {
        /* The confirmed document does not depend on preferences. */
      }
      mutate(() => emptyReceiptDraft(scope));
      setRestored(false);
      void options.reload();
      void catalog.reload();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No llegó la confirmación. Tu recepción se conserva para reintentar.',
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const totalBoxes = draft.lines.reduce(
    (sum, line) => sum + (/^\d+$/.test(line.boxes) ? Number(line.boxes) : 0),
    0,
  );
  const title = (line: QuickLine) =>
    options.data?.options.find((option) => option.optionKey === line.optionKey)?.label ??
    'Producto de la recepción';
  const quantitySummary = (lines: QuickLine[], quantity: number) =>
    lines.some((line) => line.packing?.commercialUnitLabel)
      ? `${quantity} unidades recibidas`
      : `${quantity} ${quantity === 1 ? 'caja recibida' : 'cajas recibidas'}`;
  return (
    <AppShell session={session} current="/recepciones">
      <main id="app-main" className="main-content operations-page">
        <div className="page-heading">
          <div>
            <h1>Recibir mercancía</h1>
            <p>Elige lo que llegó, indica la cantidad y guarda.</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/inventario">
              Ver inventario
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        {returnToSale ? (
          <p className={styles.help}>
            <Link href="/ventas/nueva">Volver a la venta guardada</Link>
          </p>
        ) : null}
        {restored ? (
          <p role="status" className={styles.status}>
            Recuperamos tu borrador en este dispositivo. Revisa productos, empaques y cantidades
            antes de guardar.
          </p>
        ) : null}
        {storageError ? <FormError message={storageError} /> : null}
        {options.error ? (
          <LoadError error={options.error} retry={() => void options.reload()} />
        ) : null}
        {catalog.error ? (
          <LoadError error={catalog.error} retry={() => void catalog.reload()} />
        ) : null}
        {!ready && !options.error && !catalog.error ? <LoadingRows /> : null}
        {saved ? (
          <section className={styles.section} aria-label="Recepción confirmada">
            <CheckCircle2 aria-hidden="true" />
            <h2>Recepción guardada</h2>
            <p>
              <strong>{saved.result.receiptNumber}</strong> ·{' '}
              {quantitySummary(
                saved.draft.lines,
                saved.draft.lines.reduce((sum, line) => sum + Number(line.boxes), 0),
              )}
              . Los lotes conservan su empaque y procedencia.
            </p>
            <ul>
              {saved.result.lots.map((lot) => (
                <li key={lot.id}>
                  <Link href={`/inventario?lote=${lot.id}`}>{lot.code}</Link>
                </li>
              ))}
            </ul>
            <div className={styles.inlineActions}>
              <Button
                onClick={() => {
                  setSaved(null);
                  setError('');
                  setPicker('new');
                }}
              >
                Recibir más mercancía
              </Button>
              {returnToSale ? (
                <Button variant="outline" asChild>
                  <Link href="/ventas/nueva">Continuar la venta</Link>
                </Button>
              ) : null}
            </div>
          </section>
        ) : ready ? (
          <form onSubmit={inspect}>
            <fieldset disabled={locked}>
              {!draft.lines.length ? (
                <section className={styles.section}>
                  <h2>¿Qué mercancía llegó?</h2>
                  <p className={styles.help}>
                    Las opciones habituales ya están listas. No necesitas registrar proveedor ni
                    escribir una referencia.
                  </p>
                  <Button type="button" size="lg" onClick={() => setPicker('new')}>
                    <Plus aria-hidden="true" />
                    Recibir mercancía
                  </Button>
                </section>
              ) : (
                <section aria-labelledby="received-products-title">
                  <div className="section-heading">
                    <h2 id="received-products-title">Productos recibidos</h2>
                  </div>
                  {draft.lines.map((line, index) => (
                    <ReceiptQuickLine
                      key={line.key}
                      line={line}
                      index={index}
                      option={options.data!.options.find(
                        (option) => option.optionKey === line.optionKey,
                      )}
                      update={updateLine}
                      remove={() =>
                        mutate((current) => ({
                          ...current,
                          lines: current.lines.filter((item) => item.key !== line.key),
                        }))
                      }
                      choose={() => setPicker(line.key)}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={draft.lines.length >= 50}
                    onClick={() => setPicker('new')}
                  >
                    <Plus aria-hidden="true" />
                    Otra fruta
                  </Button>
                </section>
              )}
              <details
                className={styles.details}
                onToggle={(event) => {
                  if (event.currentTarget.open && !suppliers) void loadSuppliers();
                }}
              >
                <summary>Más detalles (opcional)</summary>
                <p className={styles.help}>
                  Se asignará un número único y la fecha actual de Venezuela al guardar.
                </p>
                <div className={styles.detailsGrid}>
                  <Field>
                    <FieldLabel htmlFor="receipt-supplier">Proveedor (opcional)</FieldLabel>
                    <NativeSelect
                      id="receipt-supplier"
                      value={draft.supplierId}
                      onChange={(event) =>
                        mutate((current) => ({ ...current, supplierId: event.target.value }))
                      }
                    >
                      <option value="">Sin proveedor indicado</option>
                      {suppliers
                        ?.filter((supplier) => supplier.active)
                        .map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="receipt-reference">
                      Documento del proveedor (opcional)
                    </FieldLabel>
                    <Input
                      id="receipt-reference"
                      maxLength={80}
                      value={draft.reference}
                      onChange={(event) =>
                        mutate((current) => ({ ...current, reference: event.target.value }))
                      }
                      placeholder="Factura o nota de entrega"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="receipt-date">
                      Fecha y hora de recepción (opcional)
                    </FieldLabel>
                    <Input
                      id="receipt-date"
                      type="datetime-local"
                      value={draft.date}
                      onChange={(event) =>
                        mutate((current) => ({ ...current, date: event.target.value }))
                      }
                    />
                    <p className={styles.help}>
                      Vacío: hora actual · America/Caracas. Ahora:{' '}
                      {caracasDateTime().replace('T', ' ')}.
                    </p>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="receipt-notes">Observaciones generales</FieldLabel>
                    <Textarea
                      id="receipt-notes"
                      maxLength={500}
                      value={draft.notes}
                      onChange={(event) =>
                        mutate((current) => ({ ...current, notes: event.target.value }))
                      }
                    />
                  </Field>
                </div>
                {supplierError ? (
                  <p role="status" className={styles.help}>
                    {supplierError}
                    <Button type="button" variant="ghost" onClick={() => void loadSuppliers()}>
                      Reintentar proveedores
                    </Button>
                  </p>
                ) : null}
              </details>
            </fieldset>
            {!review ? <FormError message={error} /> : null}
            {draft.lines.length ? (
              <div className={styles.sticky} role="region" aria-label="Resumen y guardado">
                <div>
                  <strong>{quantitySummary(draft.lines, totalBoxes)}</strong>
                  <p>Todos los productos se guardan en una sola recepción.</p>
                </div>
                <Button
                  type={draft.pending ? 'button' : 'submit'}
                  onClick={draft.pending ? () => setReview(true) : undefined}
                  disabled={busy || !!storageError}
                >
                  {draft.pending ? 'Resolver confirmación pendiente' : 'Revisar y guardar'}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>
            ) : null}
            {draft.lines.length && !draft.pending ? (
              <p className={styles.help}>
                Tu borrador se conserva en este dispositivo para tu acceso, también si cierras
                sesión. Se elimina al guardar.
              </p>
            ) : null}
          </form>
        ) : null}
        <Dialog
          open={picker !== null}
          onOpenChange={(open) => {
            if (!open) setPicker(null);
          }}
        >
          <DialogContent className={styles.pickerDialog}>
            <DialogHeader>
              <DialogTitle>Elige la mercancía</DialogTitle>
              <DialogDescription>
                Busca fruta, variedad o calibre. Solo se registrará lo que agregues a la recepción.
              </DialogDescription>
            </DialogHeader>
            {options.data ? (
              <>
                <HabitualProductPicker
                  id="receipt-picker"
                  options={pickerOptions(options.data.options)}
                  scope={scope}
                  onSelect={(option) => choose(option.optionKey)}
                />
                <ReceiptExceptionalCaliber
                  options={options.data}
                  reload={async () => {
                    await options.reload();
                    await catalog.reload();
                  }}
                />
              </>
            ) : null}
          </DialogContent>
        </Dialog>
        <Dialog
          open={review}
          onOpenChange={(open) => {
            if (!busy) setReview(open);
          }}
        >
          <DialogContent className={styles.reviewDialog}>
            <DialogHeader>
              <DialogTitle>Revisar recepción</DialogTitle>
              <DialogDescription>
                {draft.pending
                  ? 'La respuesta anterior no quedó confirmada. Reintentar conserva la misma recepción y no duplica cajas.'
                  : 'Confirma productos, cantidades y empaques. Guardar registrará toda la recepción una sola vez.'}
              </DialogDescription>
            </DialogHeader>
            <p>
              Número: se asigna al guardar ·{' '}
              {draft.date ? draft.date.replace('T', ' ') : 'Fecha actual de Venezuela'} ·{' '}
              {draft.supplierId
                ? (suppliers?.find((supplier) => supplier.id === draft.supplierId)?.name ??
                  'Proveedor seleccionado')
                : 'Sin proveedor indicado'}
            </p>
            <ul className={styles.reviewList}>
              {draft.lines.map((line) => (
                <li key={line.key}>
                  <strong>{title(line)}</strong>
                  <p>
                    Cantidad: {line.boxes} ·{' '}
                    {line.packing?.commercialUnitLabel ?? (line.boxes === '1' ? 'caja' : 'cajas')}
                  </p>
                  <p>
                    {line.blisterOverride
                      ? `${line.blisterOverride} blíster por caja · excepción confirmada: ${line.overrideReason}`
                      : line.packing?.blistersPerBox
                        ? `${line.packing.blistersPerBox} blíster por caja`
                        : line.packing?.packingModel === 'halves'
                          ? 'Caja y media comercial'
                          : (line.packing?.commercialUnitLabel ?? 'Caja completa')}
                  </p>
                </li>
              ))}
            </ul>
            <p>
              <strong>{quantitySummary(draft.lines, totalBoxes)}</strong>
            </p>
            <FormError message={error} />
            {authNeeded ? (
              <p className={styles.warning}>
                Tu recepción pendiente se conserva.{' '}
                <Link href="/login">Iniciar sesión de nuevo</Link> para recuperar la misma
                confirmación.
              </p>
            ) : null}
            <div className={styles.inlineActions}>
              <Button
                type="button"
                disabled={busy || !!storageError}
                onClick={() => void confirm()}
              >
                {busy
                  ? 'Guardando recepción…'
                  : draft.pending
                    ? 'Reintentar misma recepción'
                    : 'Guardar recepción'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setReview(false)}
              >
                {draft.pending ? 'Cerrar resumen' : 'Corregir datos'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <PageFooter />
      </main>
    </AppShell>
  );
}
