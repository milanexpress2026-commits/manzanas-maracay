'use client';
import { useRef, useState } from 'react';
import { Info, LoaderCircle, Save } from 'lucide-react';
import {
  configurationSchema,
  fruitSchema,
  varietySchema,
  caliberSchema,
  updatePackingSchema,
  type Catalog,
  type Configuration,
  type PackingModel,
  type HalfPreparation,
  type Presentation,
} from '@mm/domain';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Field, FieldGroup, FieldLabel, FieldDescription } from './ui/field';
import { Alert, AlertDescription } from './ui/alert';
import { NativeSelect } from './ui/native-select';
import { saveCatalog } from '@/lib/catalog-api';
import { presentationNames } from '@/lib/commercial-ui';

export type FormKind = 'fruits' | 'varieties' | 'calibers' | 'configurations';
export function CatalogForm({
  kind,
  editing,
  catalog,
  onCancel,
  onSaved,
}: {
  kind: FormKind;
  editing?: Configuration;
  catalog: Catalog;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(''),
    [fruitId, setFruitId] = useState(editing?.fruitId ?? '');
  const [varietyId, setVarietyId] = useState(editing?.varietyId ?? ''),
    [caliberId, setCaliberId] = useState(editing?.caliberId ?? '');
  const [line, setLine] = useState(editing?.commercialLine ?? 'Estándar');
  const [model, setModel] = useState<PackingModel>(editing?.packingModel ?? 'blister');
  const [half, setHalf] = useState<HalfPreparation>(editing?.halfPreparation ?? 'counted');
  const [presentations, setPresentations] = useState<Presentation[]>(
    editing?.allowedPresentations ?? ['box', 'half_box', 'blister'],
  );
  const [blisters, setBlisters] = useState(
    editing?.blistersPerBox == null ? '' : String(editing.blistersPerBox),
  );
  const [weight, setWeight] = useState(editing?.boxWeightKg ?? '');
  const [confirmed, setConfirmed] = useState(editing?.confirmationStatus === 'confirmed');
  const [notes, setNotes] = useState(editing?.notes ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<{ json: string; key: string } | null>(null),
    submitting = useRef(false),
    errorRef = useRef<HTMLDivElement>(null);
  const availableVarieties = catalog.varieties.filter((v) => v.fruitId === fruitId);
  const availableCalibers = catalog.calibers.filter((c) => c.fruitId === fruitId);
  function changeModel(value: PackingModel) {
    setModel(value);
    setConfirmed(false);
    if (value === 'whole') {
      setPresentations(['box']);
      setHalf('none');
      setBlisters('');
    } else if (value === 'halves') {
      setPresentations(['box', 'half_box']);
      setHalf('commercial');
      setBlisters('');
    } else {
      setPresentations(['box', 'half_box', 'blister']);
      setHalf('pending');
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    const packing = {
      packingModel: model,
      halfPreparation: half,
      allowedPresentations: presentations,
      blistersPerBox: model === 'blister' && blisters !== '' ? Number(blisters) : null,
      boxWeightKg: weight.trim() ? weight.trim().replace(',', '.') : null,
      confirmationStatus: confirmed ? 'confirmed' : 'pending',
      notes,
    };
    const body =
      kind === 'fruits'
        ? { name }
        : kind === 'varieties'
          ? { name, fruitId }
          : kind === 'calibers'
            ? { label: name, fruitId }
            : editing
              ? { ...packing, version: editing.version }
              : {
                  fruitId,
                  varietyId: varietyId || null,
                  caliberId: caliberId || null,
                  commercialLine: line,
                  ...packing,
                };
    const schema =
      kind === 'fruits'
        ? fruitSchema
        : kind === 'varieties'
          ? varietySchema
          : kind === 'calibers'
            ? caliberSchema
            : editing
              ? updatePackingSchema
              : configurationSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los campos del formulario.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const json = JSON.stringify(parsed.data);
    if (pending.current?.json !== json) pending.current = { json, key: crypto.randomUUID() };
    submitting.current = true;
    setBusy(true);
    try {
      await saveCatalog(
        editing ? `configurations/${editing.id}` : kind,
        parsed.data,
        pending.current!.key,
        !!editing,
      );
      await onSaved();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo guardar. Conserva los datos y reintenta.',
      );
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="catalog-form">
      <fieldset disabled={busy}>
        <FieldGroup>
          {kind !== 'fruits' ? (
            <Field>
              <FieldLabel htmlFor="fruit">Fruta</FieldLabel>
              <NativeSelect
                id="fruit"
                required
                value={fruitId}
                disabled={!!editing}
                onChange={(e) => {
                  setFruitId(e.target.value);
                  setVarietyId('');
                  setCaliberId('');
                }}
              >
                <option value="">Selecciona una fruta</option>
                {catalog.fruits.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </NativeSelect>
              {!catalog.fruits.length ? (
                <FieldDescription>Crea primero una fruta en el catálogo.</FieldDescription>
              ) : null}
            </Field>
          ) : null}
          {kind === 'configurations' ? (
            <>
              <div className="commercial-form-grid">
                <Field>
                  <FieldLabel htmlFor="variety">Variedad, si aplica</FieldLabel>
                  <NativeSelect
                    id="variety"
                    value={varietyId}
                    disabled={!!editing || !fruitId}
                    onChange={(e) => setVarietyId(e.target.value)}
                  >
                    <option value="">Sin variedad</option>
                    {availableVarieties.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="caliber">Calibre, si aplica</FieldLabel>
                  <NativeSelect
                    id="caliber"
                    value={caliberId}
                    disabled={!!editing || !fruitId}
                    onChange={(e) => setCaliberId(e.target.value)}
                  >
                    <option value="">Sin calibre</option>
                    {availableCalibers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="commercial-line">
                  Nombre para distinguir este empaque
                </FieldLabel>
                <Input
                  id="commercial-line"
                  value={line}
                  maxLength={80}
                  required
                  disabled={!!editing}
                  onChange={(e) => setLine(e.target.value)}
                  placeholder="Por ejemplo: con blíster o a granel…"
                />
                <FieldDescription>
                  Por ejemplo, Estándar o Granel. No cambia la fruta ni la variedad.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="packing-model">Cómo se maneja la caja</FieldLabel>
                <NativeSelect
                  id="packing-model"
                  value={model}
                  onChange={(e) => changeModel(e.target.value as PackingModel)}
                >
                  <option value="blister">Caja con blíster</option>
                  <option value="halves">Caja y media caja, sin blíster</option>
                  <option value="whole">Solo caja completa</option>
                </NativeSelect>
              </Field>
              {model === 'blister' ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="blisters">Blíster por caja</FieldLabel>
                    <Input
                      id="blisters"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      step={1}
                      value={blisters}
                      onChange={(e) => setBlisters(e.target.value)}
                      placeholder="Pendiente de confirmar…"
                    />
                    <FieldDescription>
                      Puede quedar pendiente. El calibre nunca se convierte en cantidad de fruta.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="half-preparation">
                      ¿Cómo preparan la media caja?
                    </FieldLabel>
                    <NativeSelect
                      id="half-preparation"
                      value={half}
                      onChange={(e) => setHalf(e.target.value as HalfPreparation)}
                    >
                      <option value="pending">Pendiente de confirmar</option>
                      <option value="counted">Contando las frutas al abrir la caja</option>
                      <option value="none">No se preparan medias cajas</option>
                    </NativeSelect>
                  </Field>
                </>
              ) : null}
              <Field>
                <FieldLabel htmlFor="box-weight">Peso fijo de la caja en kg, si aplica</FieldLabel>
                <Input
                  id="box-weight"
                  inputMode="decimal"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  placeholder="Sin peso fijo…"
                />
                <FieldDescription>
                  Es parte de la presentación. No se pedirá pesar cada venta.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Presentaciones de venta permitidas</FieldLabel>
                <div className="allowed-presentations">
                  {(['box', 'half_box', 'blister'] as Presentation[])
                    .filter(
                      (p) =>
                        p === 'box' ||
                        (model !== 'whole' && (p !== 'blister' || model === 'blister')),
                    )
                    .map((p) => (
                      <label key={p}>
                        <input
                          type="checkbox"
                          checked={presentations.includes(p)}
                          disabled={p === 'box'}
                          onChange={(e) =>
                            setPresentations((current) =>
                              e.target.checked
                                ? [...current, p]
                                : current.filter((item) => item !== p),
                            )
                          }
                        />
                        {presentationNames[p]}
                      </label>
                    ))}
                </div>
                <FieldDescription>No hay venta de manzanas por pieza suelta.</FieldDescription>
              </Field>
              <label className="price-choice">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>Confirmo que este empaque y sus presentaciones son correctos</span>
              </label>
              <Field>
                <FieldLabel htmlFor="notes">Notas</FieldLabel>
                <Textarea
                  id="notes"
                  value={notes}
                  maxLength={500}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
              <Alert>
                <Info aria-hidden="true" />
                <AlertDescription>
                  Los lotes existentes conservarán el empaque con el que fueron recibidos.
                </AlertDescription>
              </Alert>
            </>
          ) : (
            <Field>
              <FieldLabel htmlFor="name">
                {kind === 'calibers'
                  ? 'Nombre del calibre'
                  : kind === 'fruits'
                    ? 'Nombre de la fruta'
                    : 'Nombre de la variedad'}
              </FieldLabel>
              <Input
                id="name"
                name="name"
                required
                value={name}
                maxLength={kind === 'calibers' ? 30 : 80}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </Field>
          )}
          {error ? (
            <Alert ref={errorRef} tabIndex={-1} variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="form-actions">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {busy ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        </FieldGroup>
      </fieldset>
    </form>
  );
}
