'use client';
import { useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Plus } from 'lucide-react';
import {
  getCatalogPreparationDefaults,
  HABITUAL_TEMPLATES_V45,
  catalogPreparationInputSchema,
  type CatalogPreparationInput,
  type CatalogPreparationPreview,
  type CatalogPreparationResult,
} from '@mm/domain';
import { saveCatalog } from '@/lib/catalog-api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field, FieldLabel } from './ui/field';
import { FormError } from './operations-ui';
import { PackingReviewFields } from './packing-review-fields';
import styles from './catalog-preparation.module.css';
import { presentationNames } from '@/lib/commercial-ui';

type Choice = { value: string; included: boolean };
type Row = Omit<CatalogPreparationInput['fruits'][number], 'varieties' | 'calibers'> & {
  included: boolean;
  varieties: Choice[];
  calibers: Choice[];
  excludedDrafts: number[];
};
function initialRows(): Row[] {
  return getCatalogPreparationDefaults().fruits.map((fruit) => ({
    ...fruit,
    included: true,
    varieties: [
      ...new Set(
        HABITUAL_TEMPLATES_V45.filter((template) => template.fruitName === fruit.name).flatMap(
          (template) => template.varieties,
        ),
      ),
    ].map((value) => ({ value, included: true })),
    calibers: [
      ...new Set(
        HABITUAL_TEMPLATES_V45.filter((template) => template.fruitName === fruit.name).flatMap(
          (template) => template.calibers,
        ),
      ),
    ].map((value) => ({ value, included: true })),
    excludedDrafts: [],
  }));
}

export function CatalogPreparation({
  onDone,
  onCancel,
}: {
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState(initialRows);
  const [preview, setPreview] = useState<CatalogPreparationPreview | null>(null);
  const [reviewedInput, setReviewedInput] = useState<CatalogPreparationInput | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CatalogPreparationResult | null>(null);
  const keys = useRef(new Map<string, { json: string; key: string }>());
  const submitting = useRef(false);
  const title = useRef<HTMLHeadingElement>(null);
  function update(index: number, changes: Partial<Row>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...changes } : row)));
    setPreview(null);
    setReviewedInput(null);
    setConfirmed(false);
  }
  function option(
    index: number,
    field: 'varieties' | 'calibers',
    position: number,
    changes: Partial<Choice>,
  ) {
    const row = rows[index];
    const previous = row[field][position].value;
    update(index, {
      [field]: row[field].map((item, i) => (i === position ? { ...item, ...changes } : item)),
      ...(field === 'varieties' && changes.value !== undefined
        ? {
            drafts: row.drafts.map((draft) =>
              draft.varietyName === previous ? { ...draft, varietyName: changes.value! } : draft,
            ),
          }
        : {}),
    });
  }
  async function request<T>(endpoint: string, body: unknown): Promise<T> {
    const json = JSON.stringify(body);
    if (keys.current.get(endpoint)?.json !== json)
      keys.current.set(endpoint, { json, key: crypto.randomUUID() });
    return saveCatalog(endpoint, body, keys.current.get(endpoint)!.key) as Promise<T>;
  }
  async function run(action: () => Promise<void>) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      requestAnimationFrame(() => title.current?.focus());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'No se pudo completar. Tu selección sigue aquí.',
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function review() {
    const input = catalogPreparationInputSchema.safeParse({
      fruits: rows
        .filter((row) => row.included)
        .map((row) => ({
          name: row.name,
          varieties: row.varieties
            .filter((choice) => choice.included)
            .map((choice) => choice.value),
          calibers: row.calibers.filter((choice) => choice.included).map((choice) => choice.value),
          drafts: row.drafts.filter(
            (draft, index) =>
              !row.excludedDrafts.includes(index) &&
              (!draft.varietyName ||
                row.varieties.some(
                  (choice) => choice.included && choice.value === draft.varietyName,
                )),
          ),
        })),
    });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? 'Revisa tu selección.');
      return;
    }
    await run(async () => {
      const next = await request<CatalogPreparationPreview>('preparation/preview', input.data);
      setReviewedInput(input.data);
      setPreview(next);
      setConfirmed(false);
    });
  }
  async function prepare() {
    if (!confirmed || !reviewedInput || !preview) return;
    await run(async () => {
      const saved = await request<CatalogPreparationResult>('preparation', {
        ...reviewedInput,
        confirmed: true,
      });
      setResult(saved);
      await onDone();
    });
  }
  return (
    <section className={styles.panel} aria-label="Preparación del catálogo">
      <h2 ref={title} tabIndex={-1}>
        {result
          ? 'Catálogo preparado'
          : preview
            ? 'Revisa lo que se guardará'
            : 'Prepara los productos habituales'}
      </h2>
      <FormError message={error} />
      {result ? (
        <>
          <p className={styles.status} role="status">
            <CheckCircle2 aria-hidden="true" /> Se guardaron los maestros y borradores
            seleccionados. Las existencias se registran al recibir la mercancía.
          </p>
          <p className={styles.help}>
            Ahora elige la variedad y el calibre que vas a recibir. El empaque se verifica con la
            mercancía.
          </p>
          <Button onClick={onCancel}>Elegir mi primer producto</Button>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void (preview ? prepare() : review());
          }}
        >
          <p className={styles.help}>
            Revisa nombres y opciones. Desmarca lo que no vende el negocio; podrás agregarlo
            después. Solo Kiwi y Uva tienen productos concretos propuestos, siempre pendientes de
            confirmar.
          </p>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {preview ? (
              <>
                <ul className={styles.previewList}>
                  {preview.fruits.map((fruit) => (
                    <li key={fruit.name}>
                      <strong>{fruit.name}</strong> ·{' '}
                      {fruit.action === 'create' ? 'Nueva fruta' : 'Reutilizar fruta existente'}
                      <div>
                        Variedades:{' '}
                        {fruit.varieties.map((row) => row.name).join(', ') || 'No se agregan'}.
                      </div>
                      <div>
                        Calibres:{' '}
                        {fruit.calibers.map((row) => row.label).join(', ') || 'No se agregan'}.
                      </div>
                      <div>
                        {fruit.drafts.length}{' '}
                        {fruit.drafts.length === 1 ? 'producto concreto' : 'productos concretos'};
                        los existentes conservan su empaque.
                      </div>
                      {fruit.drafts.map(({ draft, action }, index) => (
                        <div key={index}>
                          {draft.varietyName ?? fruit.name} · {draft.commercialLine}:{' '}
                          {draft.allowedPresentations
                            .map((presentation) => presentationNames[presentation])
                            .join(', ')}
                          {draft.boxWeightKg ? ` · ${draft.boxWeightKg} kg/caja` : ''}
                          {draft.packingModel === 'blister'
                            ? ` · ${draft.blistersPerBox ?? 'Pendiente'} blíster/caja`
                            : ''}
                          {' · '}
                          {action === 'create'
                            ? 'Nuevo borrador pendiente'
                            : 'Reutilizar sin cambios'}
                          .
                        </div>
                      ))}
                    </li>
                  ))}
                </ul>
                <p className={styles.help}>
                  {preview.created.configurations} borradores nuevos. Las variedades y calibres
                  quedan disponibles sin crear todas sus combinaciones.
                </p>
                <label className={styles.confirmation}>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <span>
                    Confirmo los nombres y borradores revisados. Entiendo que las cantidades de
                    empaque siguen pendientes y no se crea inventario.
                  </span>
                </label>
              </>
            ) : (
              rows.map((row, index) => (
                <fieldset className={styles.fruit} key={index}>
                  <legend>
                    <label className={styles.option}>
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={(event) => update(index, { included: event.target.checked })}
                      />
                      Incluir {row.name || 'fruta'}
                    </label>
                  </legend>
                  <fieldset
                    disabled={!row.included}
                    style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
                  >
                    <Field>
                      <FieldLabel htmlFor={`prepare-fruit-${index}`}>Nombre de la fruta</FieldLabel>
                      <Input
                        id={`prepare-fruit-${index}`}
                        value={row.name}
                        maxLength={80}
                        onChange={(event) => update(index, { name: event.target.value })}
                      />
                    </Field>
                    {row.varieties.length ? (
                      <div className={styles.options} aria-label={`Variedades de ${row.name}`}>
                        {row.varieties.map((choice, position) => (
                          <div className={styles.option} key={position}>
                            <input
                              type="checkbox"
                              aria-label={`Incluir variedad ${choice.value}`}
                              checked={choice.included}
                              onChange={(event) =>
                                option(index, 'varieties', position, {
                                  included: event.target.checked,
                                })
                              }
                            />
                            <Input
                              aria-label={`Nombre de variedad ${position + 1} de ${row.name}`}
                              value={choice.value}
                              disabled={!choice.included}
                              maxLength={80}
                              onChange={(event) =>
                                option(index, 'varieties', position, { value: event.target.value })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.help}>No se propone variedad obligatoria.</p>
                    )}
                    {row.calibers.length ? (
                      <details>
                        <summary>
                          Calibres habituales ·{' '}
                          {row.calibers.filter((item) => item.included).length} seleccionados
                        </summary>
                        <div className={styles.options}>
                          {row.calibers.map((choice, position) => (
                            <div className={`${styles.option} ${styles.caliber}`} key={position}>
                              <input
                                type="checkbox"
                                aria-label={`Incluir calibre ${choice.value} de ${row.name}`}
                                checked={choice.included}
                                onChange={(event) =>
                                  option(index, 'calibers', position, {
                                    included: event.target.checked,
                                  })
                                }
                              />
                              <Input
                                aria-label={`Calibre ${position + 1} de ${row.name}`}
                                value={choice.value}
                                disabled={!choice.included}
                                maxLength={30}
                                onChange={(event) =>
                                  option(index, 'calibers', position, { value: event.target.value })
                                }
                              />
                            </div>
                          ))}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            update(index, {
                              calibers: [...row.calibers, { value: '', included: true }],
                            })
                          }
                        >
                          <Plus aria-hidden="true" /> Calibre no habitual
                        </Button>
                      </details>
                    ) : null}
                    {row.drafts.map((draft, position) => {
                      const included = !row.excludedDrafts.includes(position);
                      const varietyIncluded =
                        !draft.varietyName ||
                        row.varieties.some(
                          (item) => item.included && item.value === draft.varietyName,
                        );
                      return (
                        <div className={styles.draft} key={position}>
                          <label className={styles.option}>
                            <input
                              type="checkbox"
                              disabled={!varietyIncluded}
                              checked={included && varietyIncluded}
                              onChange={(event) =>
                                update(index, {
                                  excludedDrafts: event.target.checked
                                    ? row.excludedDrafts.filter((item) => item !== position)
                                    : [...row.excludedDrafts, position],
                                })
                              }
                            />
                            Preparar {draft.varietyName ?? row.name} · {draft.commercialLine} como
                            borrador
                          </label>
                          {included && varietyIncluded ? (
                            <details>
                              <summary>Revisar o editar este empaque pendiente</summary>
                              <Field>
                                <FieldLabel htmlFor={`prepare-line-${index}-${position}`}>
                                  Nombre del empaque
                                </FieldLabel>
                                <Input
                                  id={`prepare-line-${index}-${position}`}
                                  value={draft.commercialLine}
                                  maxLength={80}
                                  onChange={(event) =>
                                    update(index, {
                                      drafts: row.drafts.map((item, i) =>
                                        i === position
                                          ? { ...item, commercialLine: event.target.value }
                                          : item,
                                      ),
                                    })
                                  }
                                />
                              </Field>
                              <PackingReviewFields
                                id={`prepare-${index}-${position}`}
                                value={draft}
                                onChange={(packing) =>
                                  update(index, {
                                    drafts: row.drafts.map((item, i) =>
                                      i === position
                                        ? { ...item, ...packing, confirmationStatus: 'pending' }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </details>
                          ) : null}
                        </div>
                      );
                    })}
                    {!row.calibers.length && !row.drafts.length ? (
                      <p className={styles.help}>
                        Solo se prepara la fruta. Empaque y presentaciones quedan por definir.
                      </p>
                    ) : null}
                  </fieldset>
                </fieldset>
              ))
            )}
          </fieldset>
          <div className={`${styles.actions} ${styles.sticky}`}>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={
                preview
                  ? () => {
                      setPreview(null);
                      setReviewedInput(null);
                      setConfirmed(false);
                    }
                  : onCancel
              }
            >
              {preview ? 'Volver a editar' : 'Cancelar'}
            </Button>
            <Button type="submit" disabled={busy || (preview !== null && !confirmed)}>
              <ClipboardCheck aria-hidden="true" />
              {busy
                ? 'Comprobando…'
                : preview
                  ? 'Confirmar y preparar catálogo'
                  : 'Revisar catálogo seleccionado'}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
