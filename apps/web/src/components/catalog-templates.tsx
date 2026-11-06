'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  HABITUAL_TEMPLATES_V45,
  catalogConfigurationBatchSchema,
  type Catalog,
  type HabitualTemplate,
  type CatalogConfigurationBatchResult,
  type Caliber,
} from '@mm/domain';
import { saveCatalog } from '@/lib/catalog-api';
import { productReceiptHref } from '@/lib/product-draft';
import { Button } from './ui/button';
import { NativeSelect } from './ui/native-select';
import { Input } from './ui/input';
import { Field, FieldLabel } from './ui/field';
import { FormError } from './operations-ui';
import { PackingReviewFields, type PackingReviewValue } from './packing-review-fields';
import styles from './catalog-preparation.module.css';
const CATALOG_TEMPLATES = HABITUAL_TEMPLATES_V45.filter(
  (template) => !template.requiresCommercialUnit,
);

export function CatalogTemplates({
  catalog,
  onSaved,
  onReload,
  returnToSale = false,
}: {
  catalog: Catalog;
  onSaved: (id: string) => Promise<void>;
  onReload: () => Promise<void>;
  returnToSale?: boolean;
}) {
  const first = CATALOG_TEMPLATES[0]!;
  const [templateId, setTemplateId] = useState(first.id);
  const template = CATALOG_TEMPLATES.find((item) => item.id === templateId)!;
  const [fruitId, setFruitId] = useState(
    catalog.fruits.find((item) => item.name.toLowerCase() === first.fruitName.toLowerCase())?.id ??
      '',
  );
  const [varietyId, setVarietyId] = useState(
    catalog.varieties.find(
      (item) =>
        item.fruitId === fruitId && item.name.toLowerCase() === first.varieties[0]?.toLowerCase(),
    )?.id ?? '',
  );
  const [calibers, setCalibers] = useState<string[]>([]);
  const [packing, setPacking] = useState<PackingReviewValue>(structuredClone(first.packing!));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [saved, setSaved] = useState<{ id: string; name: string }[]>([]);
  const remembered = useRef(new Map<string, string[]>());
  const key = useRef({ json: '', value: '' });
  const submitting = useRef(false);
  const [customCaliber, setCustomCaliber] = useState('');
  const caliberKey = useRef({ json: '', value: '' });
  const varieties = catalog.varieties.filter((row) => row.fruitId === fruitId);
  const availableCalibers = catalog.calibers.filter(
    (row) => row.fruitId === fruitId && template.calibers.includes(row.label),
  );
  const exceptionalCalibers = catalog.calibers.filter(
    (row) => row.fruitId === fruitId && !template.calibers.includes(row.label),
  );
  const selectedFruit = catalog.fruits.find((row) => row.id === fruitId);
  function changeTemplate(id: HabitualTemplate['id']) {
    const next = CATALOG_TEMPLATES.find((item) => item.id === id)!;
    const fruit = catalog.fruits.find(
      (item) => item.name.toLowerCase() === next.fruitName.toLowerCase(),
    );
    setTemplateId(id);
    setFruitId(fruit?.id ?? '');
    setVarietyId(
      catalog.varieties.find(
        (item) =>
          item.fruitId === fruit?.id &&
          item.name.toLowerCase() === next.varieties[0]?.toLowerCase(),
      )?.id ?? '',
    );
    setCalibers(remembered.current.get(`${id}:${fruit?.id ?? ''}`) ?? []);
    if (next.packing) setPacking(structuredClone(next.packing));
    setError('');
    setSaved([]);
  }
  function chooseCalibers(next: string[]) {
    setCalibers(next);
    remembered.current.set(`${templateId}:${fruitId}`, next);
    setSaved([]);
  }
  async function createCaliber() {
    if (!fruitId || !customCaliber.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    const body = { fruitId, label: customCaliber.trim() };
    const json = JSON.stringify(body);
    if (caliberKey.current.json !== json) caliberKey.current = { json, value: crypto.randomUUID() };
    try {
      const existing = catalog.calibers.find(
        (item) =>
          item.fruitId === fruitId &&
          item.label.toLocaleLowerCase('es') === body.label.toLocaleLowerCase('es'),
      );
      const row =
        existing ?? ((await saveCatalog('calibers', body, caliberKey.current.value)) as Caliber);
      chooseCalibers([...new Set([...calibers, row.id])]);
      setCustomCaliber('');
      await onReload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo agregar el calibre.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (submitting.current || !template.packing) return;
    const chosen = template.requiresCaliber ? calibers : [null];
    const parsed = catalogConfigurationBatchSchema.safeParse({
      confirmed: true,
      configurations: chosen.map((caliberId) => ({
        fruitId,
        varietyId: varietyId || null,
        caliberId,
        commercialLine: template.commercialLine,
        ...packing,
        confirmationStatus: 'pending',
        notes: 'Borrador comercial; verificar empaque al recibir.',
      })),
    });
    if (template.requiresVariety && !varietyId) {
      setError('Elige la variedad que vas a recibir.');
      return;
    }
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Elige los productos concretos.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    const json = JSON.stringify(parsed.data);
    if (key.current.json !== json) key.current = { json, value: crypto.randomUUID() };
    try {
      const result = (await saveCatalog(
        'configurations/batch',
        parsed.data,
        key.current.value,
      )) as CatalogConfigurationBatchResult;
      const entries = result.configurations.map((row, index) => ({
        id: row.id,
        name: [
          selectedFruit?.name,
          varieties.find((item) => item.id === varietyId)?.name,
          catalog.calibers.find((item) => item.id === chosen[index])?.label,
        ]
          .filter(Boolean)
          .join(' · '),
      }));
      setSaved(entries);
      await onSaved(result.configurations[0]!.id);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'No se pudo guardar. Conservamos tu selección.',
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.templates} aria-label="Plantillas de productos habituales">
      <h2>Agrega lo que vas a recibir</h2>
      <p className={styles.help}>
        Elige una plantilla y los calibres concretos. Se crean borradores revisables; las
        combinaciones que no selecciones no se agregan.
      </p>
      <FormError message={error} />
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className={styles.templateRow}>
          <Field>
            <FieldLabel htmlFor="template-kind">Plantilla de empaque</FieldLabel>
            <NativeSelect
              id="template-kind"
              value={templateId}
              onChange={(event) => changeTemplate(event.target.value as HabitualTemplate['id'])}
            >
              {CATALOG_TEMPLATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.fruitName}
                  {item.commercialLine ? ` · ${item.commercialLine}` : ' · por definir'}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="template-fruit">Fruta</FieldLabel>
            <NativeSelect
              id="template-fruit"
              value={fruitId}
              onChange={(event) => {
                setFruitId(event.target.value);
                setVarietyId('');
                setCalibers(remembered.current.get(`${templateId}:${event.target.value}`) ?? []);
                setSaved([]);
              }}
            >
              <option value="">Elige la fruta</option>
              {catalog.fruits.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {template.requiresVariety || varieties.length > 0 ? (
            <Field>
              <FieldLabel htmlFor="template-variety">Variedad</FieldLabel>
              <NativeSelect
                id="template-variety"
                value={varietyId}
                onChange={(event) => {
                  setVarietyId(event.target.value);
                  setSaved([]);
                }}
              >
                <option value="">
                  {template.requiresVariety ? 'Elige la variedad' : 'No aplica'}
                </option>
                {varieties.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}
        </div>
        <p className={styles.help}>
          {template.note} Puedes ajustar las presentaciones antes de guardar.
        </p>
        {template.requiresCaliber ? (
          <fieldset className={styles.choices}>
            <legend>Calibres habituales · {calibers.length} seleccionados</legend>
            {availableCalibers.map((row) => (
              <label key={row.id}>
                <input
                  type="checkbox"
                  checked={calibers.includes(row.id)}
                  onChange={(event) =>
                    chooseCalibers(
                      event.target.checked
                        ? [...calibers, row.id]
                        : calibers.filter((id) => id !== row.id),
                    )
                  }
                />
                {row.label}
              </label>
            ))}
            {exceptionalCalibers.length ? (
              <div>
                <p className={styles.help}>Otros calibres disponibles:</p>
                <div className={styles.choices}>
                  {exceptionalCalibers.map((row) => (
                    <label key={row.id}>
                      <input
                        type="checkbox"
                        checked={calibers.includes(row.id)}
                        onChange={(event) =>
                          chooseCalibers(
                            event.target.checked
                              ? [...calibers, row.id]
                              : calibers.filter((id) => id !== row.id),
                          )
                        }
                      />
                      {row.label}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            {!availableCalibers.length && !exceptionalCalibers.length ? (
              <p className={styles.help}>
                Agrega los calibres desde «Agregar producto» o prepara el catálogo habitual.
              </p>
            ) : null}
          </fieldset>
        ) : null}
        {template.requiresCaliber ? (
          <details key={`custom-${templateId}`}>
            <summary className={styles.option}>+ Calibre no habitual</summary>
            <Field>
              <FieldLabel htmlFor="template-caliber-new">Nuevo calibre</FieldLabel>
              <Input
                id="template-caliber-new"
                value={customCaliber}
                maxLength={30}
                placeholder="Ej.: 90, 110 o 216"
                onChange={(event) => setCustomCaliber(event.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={!fruitId || !customCaliber.trim()}
              onClick={() => void createCaliber()}
            >
              Guardar y seleccionar calibre
            </Button>
          </details>
        ) : null}
        {template.packing ? (
          <>
            <details>
              <summary className={styles.option}>Editar la plantilla para estos productos</summary>
              <PackingReviewFields
                id="template-packing"
                value={packing}
                onChange={(value) => {
                  setPacking(value);
                  setSaved([]);
                }}
              />
            </details>
            <Button
              onClick={() => void save()}
              disabled={
                busy ||
                !fruitId ||
                (template.requiresCaliber && !calibers.length) ||
                (template.requiresVariety && !varietyId)
              }
            >
              {busy ? 'Guardando…' : 'Agregar productos seleccionados'}
            </Button>
            <p className={styles.help}>
              Pulsar agrega únicamente estas combinaciones, pendientes de confirmación. No añade
              mercancía ni modifica empaques existentes.
            </p>
          </>
        ) : (
          <p className={styles.help}>
            Mandarina queda disponible como fruta. Define su empaque cuando tengas la información;
            no se crea un producto supuesto.
          </p>
        )}
      </fieldset>
      {saved.length ? (
        <div role="status" className={styles.status}>
          <p>Productos disponibles. Elige cuál vas a recibir:</p>
          <div className={styles.actions}>
            {saved.map((row) => (
              <Button asChild key={row.id} variant="outline">
                <Link href={productReceiptHref(row.id, returnToSale)}>Recibir {row.name}</Link>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
