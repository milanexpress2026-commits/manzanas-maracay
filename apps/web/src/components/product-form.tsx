'use client';
import Link from 'next/link';
import { ZodError } from 'zod';
import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, PackageCheck } from 'lucide-react';
import {
  caliberSchema,
  configurationSchema,
  fruitSchema,
  varietySchema,
  confirmedPresentationsReady,
  suggestedBlistersPerBox,
  type Catalog,
  type Caliber,
  type Fruit,
  type Variety,
  type PackingModel,
  type HalfPreparation,
  type Presentation,
} from '@mm/domain';
import { saveCatalog } from '@/lib/catalog-api';
import { presentationNames } from '@/lib/commercial-ui';
import {
  catalogFamilyFor,
  caliberSuggestions,
  mergeCatalogRows,
  productReceiptHref,
  type CatalogFamily,
} from '@/lib/product-draft';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { NativeSelect } from './ui/native-select';
import { Field, FieldGroup, FieldLabel, FieldDescription } from './ui/field';
import { FormError, SaveButton } from './operations-ui';
import { ProductCatalogField } from './product-catalog-field';
import styles from './product-form.module.css';

const familyLabels: Record<CatalogFamily, string> = {
  apple: 'Manzana tradicional',
  bulk: 'Manzana a granel',
  pear: 'Pera',
  kiwi: 'Kiwi',
  grape: 'Uva',
  other: 'Otra fruta / definir empaque',
};
export function ProductForm({
  catalog,
  onCancel,
  onSaved,
  onBusyChange,
  returnToSale = false,
  caliberMemory,
}: {
  catalog: Catalog;
  onCancel: () => void;
  onSaved: (configurationId: string) => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  returnToSale?: boolean;
  caliberMemory?: { current: Partial<Record<CatalogFamily, string[]>> };
}) {
  const [local, setLocal] = useState(catalog);
  const [step, setStep] = useState(1);
  const [fruitId, setFruitId] = useState('');
  const [varietyId, setVarietyId] = useState('');
  const [caliberId, setCaliberId] = useState('');
  const [family, setFamily] = useState<CatalogFamily>('other');
  const [chosenCalibers, setChosenCalibers] = useState<string[]>([]);
  const [model, setModel] = useState<PackingModel | ''>('');
  const [half, setHalf] = useState<HalfPreparation>('pending');
  const [presentations, setPresentations] = useState<Presentation[]>(['box']);
  const [blisters, setBlisters] = useState('');
  const [weight, setWeight] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [line, setLine] = useState('Estándar');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedId, setSavedId] = useState('');
  const localCaliberMemory = useRef<Partial<Record<CatalogFamily, string[]>>>({});
  const rememberedCalibers = caliberMemory ?? localCaliberMemory;
  const keys = useRef(new Map<string, { json: string; key: string }>());
  const submitting = useRef(false);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const savedTitle = useRef<HTMLHeadingElement>(null);
  const currentFruit = local.fruits.find((fruit) => fruit.id === fruitId);
  const varieties = local.varieties.filter((variety) => variety.fruitId === fruitId);
  const calibers = local.calibers.filter((caliber) => caliber.fruitId === fruitId);
  const variety = varieties.find((row) => row.id === varietyId);
  const caliber = calibers.find((row) => row.id === caliberId);
  const suggestions = caliberSuggestions[family];
  const audioSuggestion =
    model === 'blister'
      ? suggestedBlistersPerBox(
          currentFruit?.name ?? '',
          variety?.name ?? null,
          caliber?.label ?? null,
        )
      : null;
  const productName = [
    currentFruit?.name,
    variety?.name,
    caliber ? `Calibre ${caliber.label}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const body = {
    fruitId,
    varietyId: varietyId === 'none' ? null : varietyId,
    caliberId: caliberId === 'none' ? null : caliberId,
    commercialLine: line,
    packingModel: model,
    halfPreparation: half,
    allowedPresentations: presentations,
    blistersPerBox: model === 'blister' && blisters.trim() ? Number(blisters) : null,
    boxWeightKg: weight.trim() ? weight.trim().replace(',', '.') : null,
    confirmationStatus: confirmed ? ('confirmed' as const) : ('pending' as const),
    notes,
  };
  function chooseFamily(next: CatalogFamily) {
    setFamily(next);
    setChosenCalibers([...(rememberedCalibers.current[next] ?? caliberSuggestions[next] ?? [])]);
    setLine((current) =>
      next === 'bulk' ? 'Granel' : current === 'Granel' ? 'Estándar' : current,
    );
    setConfirmed(false);
  }
  function chooseCalibers(next: string[]) {
    rememberedCalibers.current[family] = [...next];
    setChosenCalibers(next);
  }
  function nextProduct(sameVariety: boolean) {
    setSavedId('');
    setCaliberId('');
    setConfirmed(false);
    setBlisters('');
    setError('');
    setNotice('');
    setNotes('');
    if (!sameVariety) {
      setFruitId('');
      setVarietyId('');
      setModel('');
      setHalf('pending');
      setPresentations(['box']);
      setWeight('');
      setLine('Estándar');
      setFamily('other');
    }
    move(1);
  }
  function chooseFruit(id: string, name?: string) {
    const nextFamily = catalogFamilyFor(
      name ?? local.fruits.find((fruit) => fruit.id === id)?.name ?? '',
    );
    setFruitId(id);
    setVarietyId(nextFamily === 'kiwi' ? 'none' : '');
    setCaliberId(['kiwi', 'grape'].includes(nextFamily) ? 'none' : '');
    chooseFamily(nextFamily);
    setNotice('');
    setError('');
  }
  function changeModel(next: PackingModel) {
    setModel(next);
    setConfirmed(false);
    setBlisters('');
    setHalf(next === 'whole' ? 'none' : next === 'halves' ? 'commercial' : 'pending');
    // Only the box is authorized until the operator explicitly enables other presentations.
    setPresentations(next === 'halves' ? ['box', 'half_box'] : ['box']);
  }
  function applyKnownPacking() {
    changeModel(family === 'grape' ? 'whole' : 'halves');
    setWeight(family === 'kiwi' ? '10' : '');
    if (family === 'kiwi') setLine('Caja 10 kg');
    if (family === 'bulk') setLine('Granel');
    setNotice('Empaque seleccionado. Revisa y confirma las presentaciones antes de guardar.');
  }
  async function command<T>(endpoint: string, data: unknown): Promise<T> {
    const json = JSON.stringify(data);
    if (keys.current.get(endpoint)?.json !== json)
      keys.current.set(endpoint, { json, key: crypto.randomUUID() });
    return saveCatalog(endpoint, data, keys.current.get(endpoint)!.key) as Promise<T>;
  }
  async function perform(action: () => Promise<void>): Promise<boolean> {
    if (submitting.current) return false;
    submitting.current = true;
    setBusy(true);
    onBusyChange(true);
    setError('');
    setNotice('');
    try {
      await action();
      return true;
    } catch (reason) {
      setError(
        reason instanceof ZodError
          ? (reason.issues[0]?.message ?? 'Revisa los datos.')
          : reason instanceof Error
            ? reason.message
            : 'No se pudo guardar. Tus datos siguen aquí; vuelve a intentarlo.',
      );
      return false;
    } finally {
      submitting.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }
  async function createMaster(kind: 'fruits' | 'varieties' | 'calibers', name: string) {
    return perform(async () => {
      const normalized = name.trim().toLocaleLowerCase('es');
      if (kind === 'fruits') {
        const existing = local.fruits.find(
          (row) => row.name.toLocaleLowerCase('es') === normalized,
        );
        const fruit = existing ?? (await command<Fruit>('fruits', fruitSchema.parse({ name })));
        setLocal((current) => ({ ...current, fruits: mergeCatalogRows(current.fruits, [fruit]) }));
        chooseFruit(fruit.id, fruit.name);
        setNotice(
          existing
            ? 'La fruta ya existía y quedó seleccionada.'
            : 'Fruta guardada y seleccionada. Continúa con la variedad.',
        );
      } else if (kind === 'varieties') {
        const existing = varieties.find((row) => row.name.toLocaleLowerCase('es') === normalized);
        const row =
          existing ?? (await command<Variety>('varieties', varietySchema.parse({ fruitId, name })));
        setLocal((current) => ({
          ...current,
          varieties: mergeCatalogRows(current.varieties, [row]),
        }));
        setVarietyId(row.id);
        setConfirmed(false);
        setNotice(
          existing
            ? 'La variedad ya existía y quedó seleccionada.'
            : 'Variedad guardada y seleccionada.',
        );
      } else {
        const existing = calibers.find((row) => row.label.toLocaleLowerCase('es') === normalized);
        const row =
          existing ??
          (await command<Caliber>('calibers', caliberSchema.parse({ fruitId, label: name })));
        setLocal((current) => ({
          ...current,
          calibers: mergeCatalogRows(current.calibers, [row]),
        }));
        setCaliberId(row.id);
        setConfirmed(false);
        setNotice(
          existing
            ? 'El calibre ya existía y quedó seleccionado.'
            : 'Calibre guardado y seleccionado.',
        );
      }
    });
  }
  async function addSuggestedCalibers() {
    await perform(async () => {
      const result = await command<{
        calibers: Caliber[];
        createdCount: number;
        reusedCount: number;
      }>('calibers/batch', { fruitId, labels: chosenCalibers });
      setLocal((current) => ({
        ...current,
        calibers: mergeCatalogRows(current.calibers, result.calibers),
      }));
      setNotice(
        'Calibres disponibles. Elige el que corresponde a este producto; no se cambió el empaque.',
      );
    });
  }
  function move(next: number) {
    setStep(next);
    setError('');
    setNotice('');
    requestAnimationFrame(() => stepTitle.current?.focus());
  }
  function validateProduct() {
    if (!fruitId) return 'Selecciona una fruta o pulsa Crear fruta.';
    if (!varietyId)
      return 'Selecciona o crea una variedad; si este producto no la usa, elige No aplica.';
    if (!caliberId)
      return 'Selecciona o crea un calibre; si este producto no lo usa, elige No aplica.';
    return '';
  }
  function validatePacking() {
    if (!model)
      return 'Elige cómo viene la caja. Si falta un dato, podrás guardarlo pendiente de confirmar.';
    if (family === 'grape' && (model !== 'whole' || weight.trim()))
      return 'La uva se maneja solo por caja, sin peso ni medias. Usa la opción de caja completa.';
    if (
      family === 'kiwi' &&
      (model !== 'halves' || body.boxWeightKg === null || Number(body.boxWeightKg) !== 10)
    )
      return 'Para kiwi, selecciona la caja de 10 kg y media de 5 kg; no se cuentan piezas.';
    if (family === 'bulk' && model !== 'halves')
      return 'La manzana a granel se maneja por caja y media caja, sin blíster. Usa esa opción de empaque.';
    const parsed = configurationSchema.safeParse(body);
    if (!parsed.success) return parsed.error.issues[0]?.message ?? 'Revisa los datos del empaque.';
    if (confirmed && !confirmedPresentationsReady(parsed.data))
      return 'Para confirmar blíster o media caja, indica cuántos blíster trae la caja y cómo se prepara la media. También puedes habilitar solo Caja o guardar pendiente.';
    return '';
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const issue = step === 1 ? validateProduct() : validateProduct() || validatePacking();
    if (issue) {
      setError(issue);
      return;
    }
    if (step < 3) {
      move(step + 1);
      return;
    }
    await perform(async () => {
      const result = await command<{ id: string }>(
        'configurations',
        configurationSchema.parse(body),
      );
      setSavedId(result.id);
      requestAnimationFrame(() => savedTitle.current?.focus());
      await onSaved(result.id);
    });
  }
  const packingName =
    model === 'blister'
      ? 'Caja con blíster'
      : model === 'halves'
        ? 'Caja y media caja'
        : 'Caja completa';
  if (savedId)
    return (
      <div className={styles.saved}>
        <CheckCircle2 aria-hidden="true" />
        <h3 tabIndex={-1} ref={savedTitle}>
          Producto guardado
        </h3>
        <p>{productName}</p>
        <p>
          {confirmed
            ? 'Ya puedes registrar la mercancía que recibas.'
            : 'El empaque quedó pendiente. Confírmalo antes de recibir mercancía en producción.'}{' '}
          No se añadió stock ni precio.
        </p>
        <Button asChild>
          <Link href={productReceiptHref(savedId, returnToSale)}>
            Registrar entrada de mercancía
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        {returnToSale ? (
          <Button asChild variant="outline">
            <Link href="/ventas/nueva">Volver a la venta</Link>
          </Button>
        ) : null}
        <div className={styles.inlineActions}>
          <Button type="button" variant="outline" onClick={() => nextProduct(true)}>
            Agregar otro calibre o variedad
          </Button>
          <Button type="button" variant="outline" onClick={() => nextProduct(false)}>
            Agregar otra fruta
          </Button>
        </div>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Volver al catálogo
        </Button>
      </div>
    );
  return (
    <form onSubmit={submit} className={styles.form} noValidate>
      <ol className={styles.steps} aria-label="Pasos para agregar producto">
        {['Producto', 'Empaque', 'Revisar'].map((label, index) => (
          <li key={label} aria-current={step === index + 1 ? 'step' : undefined}>
            <span aria-hidden="true">{index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <h3 className={styles.stepTitle} ref={stepTitle} tabIndex={-1}>
        {step === 1
          ? '¿Qué producto vas a agregar?'
          : step === 2
            ? '¿Cómo viene la caja?'
            : 'Revisa antes de guardar'}
      </h3>
      <FormError message={error} />
      {notice ? (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      ) : null}
      <fieldset disabled={busy} className={styles.fields}>
        {step === 1 ? (
          <FieldGroup>
            <ProductCatalogField
              id="product-fruit"
              label="Fruta"
              noun="fruta"
              value={fruitId}
              options={local.fruits.map((row) => ({ id: row.id, label: row.name }))}
              onChange={(id) => chooseFruit(id)}
              onCreate={(name) => createMaster('fruits', name)}
              busy={busy}
              initialCreate={!local.fruits.length}
              placeholder="Ej.: Manzana, Pera, Kiwi"
              help="La fruta es Manzana; Gala es su variedad. Usa el nombre que maneja el negocio."
            />
            {fruitId ? (
              <>
                <ProductCatalogField
                  id="product-variety"
                  label="Variedad"
                  noun="variedad"
                  value={varietyId}
                  options={varieties.map((row) => ({ id: row.id, label: row.name }))}
                  onChange={(id) => {
                    setVarietyId(id);
                    setConfirmed(false);
                  }}
                  onCreate={(name) => createMaster('varieties', name)}
                  busy={busy}
                  optional
                  placeholder={
                    family === 'pear'
                      ? 'Ej.: Forelle, Packcam'
                      : family === 'grape'
                        ? 'Ej.: Roja, Morada'
                        : 'Ej.: Gala, Amarilla'
                  }
                  help={
                    family === 'kiwi'
                      ? 'Kiwi puede registrarse sin variedad: elige No aplica.'
                      : 'El nombre comercial distingue variedades; no cambia productos ya registrados.'
                  }
                />
                <Field>
                  <FieldLabel htmlFor="product-family">Tipo de producto</FieldLabel>
                  <NativeSelect
                    id="product-family"
                    value={family}
                    onChange={(event) => chooseFamily(event.target.value as CatalogFamily)}
                  >
                    {Object.entries(familyLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </NativeSelect>
                  <FieldDescription>
                    Orienta las sugerencias. La fruta y variedad conservan sus nombres.
                  </FieldDescription>
                </Field>
                <ProductCatalogField
                  id="product-caliber"
                  label="Calibre"
                  noun="calibre"
                  value={caliberId}
                  options={calibers.map((row) => ({ id: row.id, label: row.label }))}
                  onChange={(id) => {
                    setCaliberId(id);
                    setConfirmed(false);
                  }}
                  onCreate={(name) => createMaster('calibers', name)}
                  busy={busy}
                  optional
                  placeholder="Ej.: 100"
                  help={
                    family === 'kiwi' || family === 'grape'
                      ? 'Puede no aplicar. No se cuentan frutas ni racimos.'
                      : 'Es una clasificación de tamaño, nunca la cantidad de frutas o blíster.'
                  }
                />
                {suggestions ? (
                  <details className={styles.options} key={family}>
                    <summary>
                      Calibres habituales de {familyLabels[family].toLocaleLowerCase('es')}
                    </summary>
                    <p>
                      Revisa el conjunto y agrega solo los que utiliza el negocio. Los que ya
                      existen se reutilizan.
                    </p>
                    <div className={styles.calibers}>
                      {suggestions.map((label) => (
                        <label key={label}>
                          <input
                            type="checkbox"
                            checked={chosenCalibers.includes(label)}
                            onChange={(event) =>
                              chooseCalibers(
                                event.target.checked
                                  ? [...chosenCalibers, label]
                                  : chosenCalibers.filter((value) => value !== label),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!chosenCalibers.length || busy}
                      onClick={() => void addSuggestedCalibers()}
                    >
                      Agregar calibres seleccionados
                    </Button>
                  </details>
                ) : null}
              </>
            ) : null}
          </FieldGroup>
        ) : step === 2 ? (
          <FieldGroup>
            <p className={styles.productName}>{productName}</p>
            {['kiwi', 'grape', 'bulk'].includes(family) ? (
              <div className={styles.suggestion}>
                <p>
                  {family === 'kiwi'
                    ? 'Kiwi: caja de 10 kg y media de 5 kg, sin conteo de piezas.'
                    : family === 'grape'
                      ? 'Uva: solo caja completa, sin kilos, racimos ni medias.'
                      : 'Granel: caja y media comercial, sin contar frutas ni usar blíster.'}
                </p>
                <Button type="button" variant="secondary" onClick={applyKnownPacking}>
                  Usar este empaque
                </Button>
              </div>
            ) : family === 'pear' ? (
              <p className={styles.hint}>
                El empaque de Forelle o Packcam se confirma con la mercancía. No deduzcas blíster ni
                medias por el calibre.
              </p>
            ) : null}
            <Field>
              <FieldLabel htmlFor="product-packing">Presentación de la caja</FieldLabel>
              <NativeSelect
                id="product-packing"
                value={model}
                onChange={(event) => changeModel(event.target.value as PackingModel)}
              >
                <option value="" disabled>
                  Selecciona cómo viene
                </option>
                <option value="blister" disabled={['kiwi', 'grape', 'bulk'].includes(family)}>
                  Caja con blíster
                </option>
                <option value="halves" disabled={family === 'grape'}>
                  Caja y media caja, sin blíster
                </option>
                <option value="whole" disabled={family === 'kiwi' || family === 'bulk'}>
                  Solo caja completa
                </option>
              </NativeSelect>
            </Field>
            {model === 'blister' ? (
              <>
                <Field>
                  <FieldLabel htmlFor="product-blisters">Blíster por caja</FieldLabel>
                  {audioSuggestion ? (
                    <p className={styles.hint}>
                      Cantidad sugerida según audio: {audioSuggestion}; verificar con la mercancía.
                      Sigue pendiente hasta tu confirmación.
                    </p>
                  ) : null}
                  <Input
                    id="product-blisters"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    step={1}
                    placeholder="Pendiente de confirmar"
                    value={blisters}
                    onChange={(event) => {
                      setBlisters(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                  <FieldDescription>
                    Escribe la cantidad verificada. La sugerencia no confirma el empaque.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>¿Qué se podrá vender?</FieldLabel>
                  <div className={styles.checks}>
                    {(['box', 'half_box', 'blister'] as Presentation[]).map((presentation) => (
                      <label key={presentation}>
                        <input
                          type="checkbox"
                          checked={presentations.includes(presentation)}
                          disabled={presentation === 'box'}
                          onChange={(event) => {
                            setPresentations((current) =>
                              event.target.checked
                                ? [...current, presentation]
                                : current.filter((value) => value !== presentation),
                            );
                            setConfirmed(false);
                          }}
                        />
                        {presentationNames[presentation]}
                      </label>
                    ))}
                  </div>
                </Field>
                {presentations.includes('half_box') ? (
                  <Field>
                    <FieldLabel htmlFor="product-half">¿Cómo preparan la media caja?</FieldLabel>
                    <NativeSelect
                      id="product-half"
                      value={half}
                      onChange={(event) => {
                        setHalf(event.target.value as HalfPreparation);
                        setConfirmed(false);
                      }}
                    >
                      <option value="pending">Pendiente de confirmar</option>
                      <option value="counted">Contando las frutas al abrir la caja</option>
                    </NativeSelect>
                    <FieldDescription>
                      La cantidad real se registra al abrir cada caja; no se inventa ahora.
                    </FieldDescription>
                  </Field>
                ) : null}
              </>
            ) : model === 'halves' ? (
              <p className={styles.hint}>
                Presentaciones: caja y media caja comercial. Una caja se divide en dos medias, sin
                conteo de piezas.
              </p>
            ) : model === 'whole' ? (
              <p className={styles.hint}>Se venderá únicamente la caja completa.</p>
            ) : null}
            {family === 'kiwi' && model ? (
              <Field>
                <FieldLabel htmlFor="product-kiwi-weight">Peso definido por caja (kg)</FieldLabel>
                <Input
                  id="product-kiwi-weight"
                  value={weight}
                  inputMode="decimal"
                  onChange={(event) => {
                    setWeight(event.target.value);
                    setConfirmed(false);
                  }}
                />
                <FieldDescription>
                  Para kiwi, 10 kg por caja y 5 kg por media. No se pesa cada venta.
                </FieldDescription>
              </Field>
            ) : null}
            <details className={styles.options}>
              <summary>Más opciones</summary>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="product-line">
                    Nombre para distinguir este empaque
                  </FieldLabel>
                  <Input
                    id="product-line"
                    value={line}
                    maxLength={80}
                    onChange={(event) => setLine(event.target.value)}
                  />
                  <FieldDescription>
                    Ej.: Estándar o Granel. No cambia la fruta ni la variedad.
                  </FieldDescription>
                </Field>
                {!['kiwi', 'grape'].includes(family) ? (
                  <Field>
                    <FieldLabel htmlFor="product-weight">
                      Peso definido por caja, si aplica (kg)
                    </FieldLabel>
                    <Input
                      id="product-weight"
                      inputMode="decimal"
                      value={weight}
                      placeholder="Sin peso definido"
                      onChange={(event) => {
                        setWeight(event.target.value);
                        setConfirmed(false);
                      }}
                    />
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel htmlFor="product-notes">Notas del empaque</FieldLabel>
                  <Textarea
                    id="product-notes"
                    value={notes}
                    maxLength={500}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </Field>
              </FieldGroup>
            </details>
            <label className={styles.confirm}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Confirmo que este empaque y sus presentaciones son correctos.
                <small>Si falta información, déjalo pendiente. No se crea inventario.</small>
              </span>
            </label>
          </FieldGroup>
        ) : (
          <div className={styles.review}>
            <PackageCheck aria-hidden="true" />
            <h4>{productName}</h4>
            <dl>
              <div>
                <dt>Empaque</dt>
                <dd>{packingName}</dd>
              </div>
              {model === 'blister' ? (
                <div>
                  <dt>Blíster por caja</dt>
                  <dd>{blisters || 'Pendiente de confirmar'}</dd>
                </div>
              ) : null}
              <div>
                <dt>Se podrá vender</dt>
                <dd>
                  {presentations.map((presentation) => presentationNames[presentation]).join(', ')}
                </dd>
              </div>
              {model === 'blister' && presentations.includes('half_box') ? (
                <div>
                  <dt>Media caja</dt>
                  <dd>
                    {half === 'counted' ? 'Conteo real al abrir la caja' : 'Pendiente de confirmar'}
                  </dd>
                </div>
              ) : null}
              {weight ? (
                <div>
                  <dt>Peso por caja</dt>
                  <dd>
                    {weight} kg{family === 'kiwi' ? ' · media de 5 kg' : ''}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Nombre del empaque</dt>
                <dd>{line}</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>{confirmed ? 'Confirmado' : 'Pendiente de confirmar'}</dd>
              </div>
            </dl>
            {notes ? <p>{notes}</p> : null}
            <p className={styles.hint}>
              Guardar agrega el producto al catálogo. Las cajas, costos y precios se registran
              después, al recibir mercancía.
            </p>
          </div>
        )}
      </fieldset>
      <div className={styles.actions}>
        {step === 1 ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled={busy} onClick={() => move(step - 1)}>
            <ArrowLeft aria-hidden="true" />
            Atrás
          </Button>
        )}
        <SaveButton busy={busy}>
          {step === 1 ? (
            <>
              Continuar al empaque
              <ArrowRight aria-hidden="true" />
            </>
          ) : step === 2 ? (
            <>
              Revisar producto
              <ArrowRight aria-hidden="true" />
            </>
          ) : (
            'Guardar producto'
          )}
        </SaveButton>
      </div>
    </form>
  );
}
