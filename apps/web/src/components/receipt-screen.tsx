'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Plus, Trash2, Truck, CheckCircle2, ArrowRight, Info } from 'lucide-react';
import { receiptSchema, type Catalog, type Supplier, type ReceiptResult } from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Field, FieldGroup, FieldLabel, FieldDescription } from './ui/field';
import { NativeSelect } from './ui/native-select';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { FormError, LoadError, LoadingRows, PageFooter, SaveButton } from './operations-ui';
import { useRemote, useCommand, displayMoney } from '@/lib/inventory-api';
type LineDraft = {
  key: number;
  configurationId: string;
  boxes: string;
  cost: string;
  blisters: string;
  notes: string;
};
function localDateTime() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
const blankLine = (key: number): LineDraft => ({
  key,
  configurationId: '',
  boxes: '1',
  cost: '',
  blisters: '',
  notes: '',
});
export function ReceiptScreen({ session }: { session: AppSession }) {
  const catalog = useRemote<Catalog>('/api/catalog'),
    suppliers = useRemote<Supplier[]>('/api/suppliers');
  const [supplierId, setSupplierId] = useState(''),
    [reference, setReference] = useState(''),
    [date, setDate] = useState(''),
    [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([blankLine(1)]),
    [nextKey, setNextKey] = useState(2);
  const [review, setReview] = useState<ReturnType<typeof receiptSchema.parse> | null>(null),
    [saved, setSaved] = useState<ReceiptResult | null>(null);
  const command = useCommand();
  const activeSuppliers = suppliers.data?.filter((s) => s.active) ?? [];
  const ready = !!catalog.data && !!suppliers.data && !catalog.error && !suppliers.error;
  const canReceive = ready && activeSuppliers.length > 0 && catalog.data!.configurations.length > 0;
  const totalBoxes = lines.reduce(
    (sum, line) => sum + (Number.isSafeInteger(Number(line.boxes)) ? Number(line.boxes) : 0),
    0,
  );
  function updateLine(key: number, changes: Partial<LineDraft>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }
  function validate(e: FormEvent) {
    e.preventDefault();
    command.setError('');
    const receivedDate = new Date(date);
    if (!date || Number.isNaN(receivedDate.valueOf())) {
      command.setError('Indica una fecha y hora válidas para la recepción.');
      return;
    }
    const result = receiptSchema.safeParse({
      supplierId,
      reference,
      receivedAt: receivedDate.toISOString(),
      notes,
      lines: lines.map((line) => ({
        configurationId: line.configurationId,
        boxes: Number(line.boxes),
        unitCostUsd: line.cost.trim().replace(',', '.'),
        ...(line.blisters ? { blistersPerBox: Number(line.blisters) } : {}),
        notes: line.notes,
      })),
    });
    if (!result.success) {
      command.setError(result.error.issues[0]?.message ?? 'Revisa los datos de la recepción.');
      return;
    }
    setReview(result.data);
  }
  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!review || command.busy) return;
    try {
      const result = await command.run<ReceiptResult>('/api/receipts', review);
      setSaved(result);
      setReview(null);
    } catch {}
  }
  function reset() {
    setSaved(null);
    setReview(null);
    setReference('');
    setDate(localDateTime());
    setNotes('');
    setLines([blankLine(nextKey)]);
    setNextKey((key) => key + 1);
    command.setError('');
  }
  return (
    <AppShell session={session} current="/recepciones">
      <main id="app-main" className="main-content operations-page">
        <div className="page-heading">
          <div>
            <h1>Recepción de mercancía</h1>
            <p>Registra lo que llegó y conserva el empaque de cada lote.</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/inventario">
              Ver inventario
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
        {catalog.error ? (
          <LoadError error={catalog.error} retry={() => void catalog.reload()} />
        ) : null}
        {suppliers.error ? (
          <LoadError error={suppliers.error} retry={() => void suppliers.reload()} />
        ) : null}
        {!ready && (catalog.loading || suppliers.loading) ? <LoadingRows /> : null}
        {saved ? (
          <section className="receipt-complete operations-panel" aria-label="Recepción confirmada">
            <CheckCircle2 aria-hidden="true" />
            <h2>Mercancía recibida</h2>
            <p>
              Se crearon {saved.lots.length} lotes con sus cajas cerradas. Los blíster equivalentes
              no se suman como existencias adicionales.
            </p>
            <ul>
              {saved.lots.map((lot) => (
                <li key={lot.id}>
                  <Link href={`/inventario?lote=${lot.id}`}>
                    {lot.code}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            <div className="inline-actions">
              <Button onClick={reset}>Registrar otra recepción</Button>
              <Button variant="outline" asChild>
                <Link href="/inventario">Consultar inventario</Link>
              </Button>
            </div>
          </section>
        ) : ready ? (
          <>
            {!canReceive ? (
              <Alert>
                <Info aria-hidden="true" />
                <AlertDescription>
                  {activeSuppliers.length === 0 ? (
                    <p>
                      Primero <Link href="/proveedores">agrega un proveedor activo</Link>.
                    </p>
                  ) : null}
                  {catalog.data!.configurations.length === 0 ? (
                    <p>
                      Primero <Link href="/catalogo">crea una configuración de empaque en el catálogo</Link>
                      .
                    </p>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
            <form className="receipt-form" onSubmit={validate}>
              <fieldset disabled={command.busy || !canReceive}>
                <section className="operations-panel reception-data">
                  <div className="panel-heading">
                    <Truck aria-hidden="true" />
                    <h2>Datos de la recepción</h2>
                  </div>
                  <FieldGroup className="operation-form-grid">
                    <Field>
                      <FieldLabel htmlFor="receipt-supplier">Proveedor</FieldLabel>
                      <NativeSelect
                        id="receipt-supplier"
                        required
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                      >
                        <option value="">Selecciona el proveedor</option>
                        {activeSuppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="receipt-reference">Referencia del documento</FieldLabel>
                      <Input
                        id="receipt-reference"
                        required
                        maxLength={80}
                        value={reference}
                        placeholder="Factura o nota de entrega"
                        onChange={(e) => setReference(e.target.value)}
                      />
                      <FieldDescription>
                        La referencia no se puede repetir para el mismo proveedor.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="receipt-date">Fecha y hora de recepción</FieldLabel>
                      <Input
                        id="receipt-date"
                        type="datetime-local"
                        required
                        value={date}
                        onFocus={() => {
                          if (!date) setDate(localDateTime());
                        }}
                        onChange={(e) => setDate(e.target.value)}
                      />
                      <FieldDescription>Hora local de este dispositivo.</FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="receipt-notes">Observaciones generales</FieldLabel>
                      <Textarea
                        id="receipt-notes"
                        maxLength={500}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Estado de la mercancía, transporte…"
                      />
                    </Field>
                  </FieldGroup>
                </section>
                <section className="receipt-lines" aria-label="Productos recibidos">
                  <div className="section-heading">
                    <h2>Productos recibidos</h2>
                    <span>
                      {lines.length} {lines.length === 1 ? 'línea' : 'líneas'}
                    </span>
                  </div>
                  {lines.map((line, index) => {
                    const config = catalog.data!.configurations.find(
                      (c) => c.id === line.configurationId,
                    );
                    return (
                      <section
                        key={line.key}
                        className="operations-panel receipt-line"
                        aria-labelledby={`line-title-${line.key}`}
                      >
                        <div className="receipt-line-title">
                          <h3 id={`line-title-${line.key}`}>Producto {index + 1}</h3>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Quitar producto ${index + 1}`}
                            disabled={lines.length === 1}
                            onClick={() =>
                              setLines((list) => list.filter((item) => item.key !== line.key))
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        <FieldGroup>
                          <Field>
                            <FieldLabel htmlFor={`line-product-${line.key}`}>
                              Fruta, variedad y calibre
                            </FieldLabel>
                            <NativeSelect
                              id={`line-product-${line.key}`}
                              required
                              value={line.configurationId}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  configurationId: e.target.value,
                                  blisters: '',
                                })
                              }
                            >
                              <option value="">Selecciona un empaque del catálogo</option>
                              {catalog.data!.configurations.map((c) => (
                                <option value={c.id} key={c.id}>
                                  {c.fruit} · {c.variety} · calibre {c.caliber} · {c.blistersPerBox}{' '}
                                  blíster/caja
                                </option>
                              ))}
                            </NativeSelect>
                          </Field>
                          <div className="receipt-quantities">
                            <Field>
                              <FieldLabel htmlFor={`line-boxes-${line.key}`}>
                                Cajas cerradas recibidas
                              </FieldLabel>
                              <Input
                                id={`line-boxes-${line.key}`}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={1000}
                                step={1}
                                required
                                value={line.boxes}
                                onChange={(e) => updateLine(line.key, { boxes: e.target.value })}
                              />
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`line-cost-${line.key}`}>
                                Costo por caja (USD)
                              </FieldLabel>
                              <Input
                                id={`line-cost-${line.key}`}
                                type="text"
                                inputMode="decimal"
                                required
                                maxLength={19}
                                pattern="[0-9]{1,14}([.,][0-9]{1,4})?"
                                placeholder="0,00"
                                value={line.cost}
                                onChange={(e) => updateLine(line.key, { cost: e.target.value })}
                              />
                              <FieldDescription>Hasta cuatro decimales.</FieldDescription>
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`line-blisters-${line.key}`}>
                                Blíster por caja en este lote
                              </FieldLabel>
                              <Input
                                id={`line-blisters-${line.key}`}
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={100}
                                step={1}
                                placeholder={
                                  config
                                    ? `${config.blistersPerBox} (habitual)`
                                    : 'Elige un empaque'
                                }
                                value={line.blisters}
                                onChange={(e) => updateLine(line.key, { blisters: e.target.value })}
                              />
                              <FieldDescription>
                                Vacío conserva la regla habitual. Corregirlo solo cambia este lote.
                              </FieldDescription>
                            </Field>
                          </div>
                          <Field>
                            <FieldLabel htmlFor={`line-notes-${line.key}`}>
                              Notas del lote
                            </FieldLabel>
                            <Input
                              id={`line-notes-${line.key}`}
                              maxLength={500}
                              value={line.notes}
                              onChange={(e) => updateLine(line.key, { notes: e.target.value })}
                            />
                          </Field>
                        </FieldGroup>
                      </section>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={lines.length >= 50}
                    onClick={() => {
                      setLines((current) => [...current, blankLine(nextKey)]);
                      setNextKey((key) => key + 1);
                    }}
                  >
                    <Plus data-icon="inline-start" />
                    Agregar producto
                  </Button>
                </section>
              </fieldset>
              <FormError message={!review ? command.error : ''} />
              <div className="receipt-submit">
                <div>
                  <strong>{totalBoxes} cajas cerradas</strong>
                  <p>La cantidad de frutas queda desconocida hasta realizar un conteo físico.</p>
                </div>
                <Button type="submit" disabled={command.busy || !canReceive}>
                  Revisar recepción
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </form>
          </>
        ) : null}
        <PageFooter />
        <Dialog
          open={!!review}
          onOpenChange={(open) => {
            if (!open && !command.busy) setReview(null);
          }}
        >
          <DialogContent className="catalog-dialog">
            <DialogHeader>
              <DialogTitle>Confirmar recepción</DialogTitle>
              <DialogDescription>
                Se crearán los lotes y sus existencias en una sola operación.
              </DialogDescription>
            </DialogHeader>
            {review ? (
              <form onSubmit={confirm} className="catalog-form">
                <div className="receipt-review">
                  <p>
                    <strong>{activeSuppliers.find((s) => s.id === review.supplierId)?.name}</strong>
                    <br />
                    Referencia: {review.reference}
                  </p>
                  <ul>
                    {review.lines.map((line, index) => {
                      const config = catalog.data?.configurations.find(
                        (c) => c.id === line.configurationId,
                      );
                      return (
                        <li key={index}>
                          <strong>
                            {config?.fruit} {config?.variety} · calibre {config?.caliber}
                          </strong>
                          <span>
                            {line.boxes} cajas · {line.blistersPerBox ?? config?.blistersPerBox}{' '}
                            blíster/caja
                          </span>
                          <span>{displayMoney(line.unitCostUsd)} por caja</span>
                        </li>
                      );
                    })}
                  </ul>
                  <p>
                    Los empaques quedan guardados como historia de cada lote. Comprueba cantidades y
                    costos antes de confirmar.
                  </p>
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
                  <SaveButton busy={command.busy}>Confirmar recepción</SaveButton>
                </div>
              </form>
            ) : null}
          </DialogContent>
        </Dialog>
      </main>
    </AppShell>
  );
}
