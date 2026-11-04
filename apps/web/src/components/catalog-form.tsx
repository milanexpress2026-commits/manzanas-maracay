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
} from '@mm/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { saveCatalog } from '@/lib/catalog-api';
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
    [fruitId, setFruitId] = useState(editing?.fruitId ?? ''),
    [varietyId, setVarietyId] = useState(editing?.varietyId ?? ''),
    [caliberId, setCaliberId] = useState(editing?.caliberId ?? '');
  const [blisters, setBlisters] = useState(editing ? String(editing.blistersPerBox) : ''),
    [notes, setNotes] = useState(editing?.notes ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const pending = useRef<{ json: string; key: string } | null>(null);
  const submitting = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const availableVarieties = catalog.varieties.filter((v) => v.fruitId === fruitId),
    availableCalibers = catalog.calibers.filter((c) => c.fruitId === fruitId);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError('');
    const body =
      kind === 'fruits'
        ? { name }
        : kind === 'varieties'
          ? { name, fruitId }
          : kind === 'calibers'
            ? { label: name, fruitId }
            : editing
              ? { blistersPerBox: Number(blisters), notes, version: editing.version }
              : { fruitId, varietyId, caliberId, blistersPerBox: Number(blisters), notes };
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
    const validated = schema.safeParse(body);
    if (!validated.success) {
      setError(
        kind === 'configurations'
          ? 'Completa las selecciones e indica entre 1 y 100 blíster por caja.'
          : 'Completa los campos con un nombre válido.',
      );
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const json = JSON.stringify(validated.data);
    if (pending.current?.json !== json) pending.current = { json, key: crypto.randomUUID() };
    submitting.current = true;
    setBusy(true);
    try {
      await saveCatalog(
        editing ? `configurations/${editing.id}` : kind,
        validated.data,
        pending.current!.key,
        !!editing,
      );
      await onSaved();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo guardar. Revisa la conexión e inténtalo de nuevo.',
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
              <FieldLabel htmlFor="fruit">
                Fruta <span aria-hidden="true">*</span>
              </FieldLabel>
              <NativeSelect
                id="fruit"
                required
                value={fruitId}
                disabled={!!editing}
                onChange={(event) => {
                  setFruitId(event.target.value);
                  setVarietyId('');
                  setCaliberId('');
                }}
              >
                <NativeSelectOption value="">Selecciona una fruta</NativeSelectOption>
                {catalog.fruits.map((f) => (
                  <NativeSelectOption key={f.id} value={f.id}>
                    {f.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {!catalog.fruits.length ? (
                <FieldDescription>
                  Crea una fruta en la pestaña Frutas antes de continuar.
                </FieldDescription>
              ) : null}
            </Field>
          ) : null}
          {kind === 'configurations' ? (
            <>
              <div className="form-pair">
                <Field>
                  <FieldLabel htmlFor="variety">
                    Variedad <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <NativeSelect
                    id="variety"
                    required
                    disabled={!fruitId || !!editing}
                    value={varietyId}
                    onChange={(e) => setVarietyId(e.target.value)}
                  >
                    <NativeSelectOption value="">Selecciona una variedad</NativeSelectOption>
                    {availableVarieties.map((v) => (
                      <NativeSelectOption key={v.id} value={v.id}>
                        {v.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="caliber">
                    Calibre <span aria-hidden="true">*</span>
                  </FieldLabel>
                  <NativeSelect
                    id="caliber"
                    required
                    disabled={!fruitId || !!editing}
                    value={caliberId}
                    onChange={(e) => setCaliberId(e.target.value)}
                  >
                    <NativeSelectOption value="">Selecciona un calibre</NativeSelectOption>
                    {availableCalibers.map((c) => (
                      <NativeSelectOption key={c.id} value={c.id}>
                        {c.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              {fruitId && (!availableVarieties.length || !availableCalibers.length) ? (
                <Alert>
                  <Info />
                  <AlertDescription>
                    Primero agrega las variedades y los calibres de esta fruta en sus respectivas
                    pestañas.
                  </AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor="blisters">
                  Blíster por caja <span aria-hidden="true">*</span>
                </FieldLabel>
                <Input
                  id="blisters"
                  name="blisters"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="100"
                  step="1"
                  required
                  value={blisters}
                  onChange={(e) => setBlisters(e.target.value)}
                  placeholder="Ej. 5"
                  aria-describedby="blisters-help"
                />
                <FieldDescription id="blisters-help">
                  Cantidad habitual de blíster intactos en una caja cerrada.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="notes">
                  Notas <span className="optional-label">(opcional)</span>
                </FieldLabel>
                <Textarea
                  id="notes"
                  name="notes"
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Indicaciones para reconocer este empaque…"
                  rows={3}
                />
              </Field>
              <Alert>
                <Info />
                <AlertDescription>
                  El calibre no determina la cantidad de frutas. La configuración de cada lote puede
                  ser diferente.
                </AlertDescription>
              </Alert>
            </>
          ) : (
            <Field>
              <FieldLabel htmlFor="record-name">
                {kind === 'calibers'
                  ? 'Nombre del calibre'
                  : kind === 'varieties'
                    ? 'Nombre de la variedad'
                    : 'Nombre de la fruta'}{' '}
                <span aria-hidden="true">*</span>
              </FieldLabel>
              <Input
                id="record-name"
                name="name"
                autoComplete="off"
                required
                minLength={kind === 'calibers' ? 1 : 2}
                maxLength={kind === 'calibers' ? 30 : 80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  kind === 'fruits'
                    ? 'Ej. Pera'
                    : kind === 'varieties'
                      ? 'Ej. Gala'
                      : 'Ej. 80 o 70/75'
                }
              />
              {kind === 'calibers' ? (
                <FieldDescription>
                  Se admite texto para clasificaciones como 70/75. No es la cantidad de fruta.
                </FieldDescription>
              ) : null}
            </Field>
          )}
        </FieldGroup>
      </fieldset>
      {error ? (
        <div ref={errorRef} tabIndex={-1} className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="form-actions">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" data-icon="inline-start" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}
