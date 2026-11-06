'use client';
import Link from 'next/link';
import type { HabitualCatalogOption, ReceiptPacking } from '@mm/domain';
import { Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { NativeSelect } from './ui/native-select';
import { Field, FieldLabel } from './ui/field';
import { PackingReviewFields } from './packing-review-fields';
import { packingLabel, presentationNames } from '@/lib/commercial-ui';
import { revisePacking, receiptOptionChanged, type QuickLine } from '@/lib/receipt-flow';
import styles from './receipt-quick.module.css';

export function ReceiptQuickLine({
  line,
  index,
  option,
  update,
  remove,
  choose,
}: {
  line: QuickLine;
  index: number;
  option: HabitualCatalogOption | undefined;
  update: (line: QuickLine) => void;
  remove: () => void;
  choose: () => void;
}) {
  const confirmed = option?.confirmationStatus === 'confirmed';
  const needsReview = !!option?.needsPresentation;
  const title = option?.label ?? 'Producto no disponible: vuelve a elegirlo';
  const effective = line.packing;
  const changePacking = (value: ReceiptPacking) => update(revisePacking(line, value));
  const displayPacking = effective?.commercialUnitLabel
    ? effective.commercialUnitLabel
    : option?.requiresCommercialUnit
      ? 'Unidad comercial por confirmar'
      : effective?.packingModel === 'blister'
        ? effective.blistersPerBox
          ? `${effective.blistersPerBox} blíster por caja`
          : 'Caja completa · blíster por confirmar'
        : effective?.packingModel === 'halves'
          ? effective.boxWeightKg
            ? `Caja ${effective.boxWeightKg} kg · media comercial`
            : 'Caja y media comercial'
          : effective
            ? 'Caja completa'
            : 'Presentación por confirmar';
  return (
    <section className={styles.line} aria-label={`Producto ${index + 1}`}>
      <div className={styles.lineHeading}>
        <div>
          <h3>{title}</h3>
          <p>{displayPacking}</p>
        </div>
        <div className={styles.costActions}>
          <Button type="button" variant="ghost" size="sm" onClick={choose}>
            Cambiar producto
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Quitar producto ${index + 1}`}
            onClick={remove}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      {option && receiptOptionChanged(line, option) ? (
        <p role="alert" className={styles.warning}>
          Este producto cambió desde que lo elegiste. Pulsa Cambiar producto y vuelve a elegirlo
          para revisar el empaque actualizado; se conservará la cantidad.
        </p>
      ) : null}
      <div className={styles.lineFields}>
        {option?.requiresCommercialUnit &&
        (!confirmed || !option.currentPacking?.commercialUnitLabel) ? (
          <Field>
            <FieldLabel htmlFor={`quick-unit-${line.key}`}>Unidad comercial</FieldLabel>
            <Input
              id={`quick-unit-${line.key}`}
              required
              maxLength={80}
              value={line.packing?.commercialUnitLabel ?? ''}
              placeholder="Indica la unidad recibida"
              onChange={(event) =>
                update({
                  ...line,
                  packing: {
                    ...(confirmed && option.currentPacking
                      ? option.currentPacking
                      : {
                          packingModel: 'whole' as const,
                          halfPreparation: 'none' as const,
                          allowedPresentations: ['box' as const],
                          blistersPerBox: null,
                          boxWeightKg: null,
                        }),
                    commercialUnitLabel: event.target.value,
                  },
                  packingChanged: true,
                  packingConfirmed: !!event.target.value.trim(),
                })
              }
            />
            <p className={styles.help}>
              Cada unidad se recibe y vende completa. Escribe cómo se identifica en la mercancía.
            </p>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`quick-boxes-${line.key}`}>
            {option?.requiresCommercialUnit || line.packing?.commercialUnitLabel
              ? 'Unidades recibidas'
              : 'Cajas recibidas'}
          </FieldLabel>
          <Input
            id={`quick-boxes-${line.key}`}
            type="number"
            inputMode="numeric"
            required
            min={1}
            max={1000}
            step={1}
            value={line.boxes}
            onChange={(event) => update({ ...line, boxes: event.target.value })}
          />
        </Field>
      </div>
      {option?.packingDiscrepancy ? (
        <div className={styles.warning}>
          <p>
            El empaque registrado difiere del habitual. Registrado:{' '}
            {option.currentPacking
              ? `${packingLabel(option.currentPacking)} · ${option.currentPacking.allowedPresentations.map((value) => presentationNames[value]).join(', ')}`
              : 'por definir'}
            . Habitual:{' '}
            {option.suggestedPacking
              ? `${packingLabel(option.suggestedPacking)} · ${option.suggestedPacking.allowedPresentations.map((value) => presentationNames[value]).join(', ')}`
              : 'por definir'}
            . Los lotes anteriores no cambian.
          </p>
          <label className={styles.confirmation}>
            <input
              type="checkbox"
              checked={line.discrepancyAccepted}
              onChange={(event) => update({ ...line, discrepancyAccepted: event.target.checked })}
            />
            Conservar el empaque registrado para esta recepción
          </label>
          <p>Si esta mercancía llegó distinta, indica una excepción de este lote abajo.</p>
        </div>
      ) : null}
      <details className={styles.details} open={needsReview || undefined}>
        <summary>
          {needsReview ? 'Confirmar presentación' : 'Revisar empaque y excepciones'}
        </summary>
        {!confirmed && !option?.requiresCommercialUnit ? (
          <>
            {!line.packing ? (
              <Field>
                <FieldLabel htmlFor={`quick-model-${line.key}`}>Presentación de la caja</FieldLabel>
                <NativeSelect
                  id={`quick-model-${line.key}`}
                  value=""
                  onChange={(event) => {
                    const model = event.target.value as ReceiptPacking['packingModel'];
                    changePacking({
                      packingModel: model,
                      halfPreparation:
                        model === 'whole' ? 'none' : model === 'halves' ? 'commercial' : 'pending',
                      allowedPresentations: model === 'halves' ? ['box', 'half_box'] : ['box'],
                      blistersPerBox: null,
                      boxWeightKg: null,
                    });
                  }}
                >
                  <option value="">Elige cómo llegó</option>
                  <option value="whole">Solo caja completa</option>
                  <option value="halves">Caja y media comercial</option>
                  <option value="blister">Caja con blíster</option>
                </NativeSelect>
              </Field>
            ) : (
              <PackingReviewFields
                id={`quick-packing-${line.key}`}
                value={line.packing}
                onChange={changePacking}
                fixedBlisters={option?.suggestedPacking?.blistersPerBox ?? null}
                fixedModel={!!option?.suggestedPacking}
                fixedWeight={!!option?.suggestedPacking}
              />
            )}
            {needsReview || line.packingChanged ? (
              <label className={styles.confirmation}>
                <input
                  type="checkbox"
                  checked={line.packingConfirmed}
                  onChange={(event) => update({ ...line, packingConfirmed: event.target.checked })}
                />
                Verifiqué esta presentación para recibir la mercancía
              </label>
            ) : (
              <p className={styles.help}>
                El resumen usará el empaque habitual mostrado. No hace falta volver a elegir entre
                cuatro y cinco blísteres.
              </p>
            )}
            <p className={styles.help}>
              Una media caja con preparación pendiente queda fuera de las presentaciones habilitadas
              hasta confirmarla.
            </p>
          </>
        ) : option?.requiresCommercialUnit ? (
          <p className={styles.help}>
            Se conserva la unidad comercial indicada, sin fracciones ni pesos supuestos.
          </p>
        ) : (
          <p className={styles.help}>
            Se conserva el empaque confirmado. Para cambiar las presentaciones futuras,{' '}
            <Link href={`/catalogo?producto=${option.configurationId}`}>
              revisa este producto en el catálogo
            </Link>
            . Tu borrador seguirá aquí.
          </p>
        )}
        {effective?.packingModel === 'blister' ? (
          <div className={styles.details}>
            <h4>Excepción solo para este lote</h4>
            <p className={styles.help}>
              Úsala si esta mercancía trae otra cantidad. No cambia el catálogo ni los lotes
              anteriores.
            </p>
            <Field>
              <FieldLabel htmlFor={`quick-override-${line.key}`}>
                Blíster por caja en este lote
              </FieldLabel>
              <Input
                id={`quick-override-${line.key}`}
                type="number"
                min={1}
                max={100}
                step={1}
                inputMode="numeric"
                value={line.blisterOverride}
                placeholder={
                  effective.blistersPerBox
                    ? `${effective.blistersPerBox} habitual`
                    : 'Sin excepción'
                }
                onChange={(event) =>
                  update({ ...line, blisterOverride: event.target.value, overrideConfirmed: false })
                }
              />
            </Field>
            {line.blisterOverride ? (
              <>
                <Field>
                  <FieldLabel htmlFor={`quick-reason-${line.key}`}>
                    Motivo de la excepción
                  </FieldLabel>
                  <Input
                    id={`quick-reason-${line.key}`}
                    maxLength={500}
                    value={line.overrideReason}
                    onChange={(event) =>
                      update({
                        ...line,
                        overrideReason: event.target.value,
                        overrideConfirmed: false,
                      })
                    }
                  />
                </Field>
                <label className={styles.confirmation}>
                  <input
                    type="checkbox"
                    checked={line.overrideConfirmed}
                    onChange={(event) =>
                      update({ ...line, overrideConfirmed: event.target.checked })
                    }
                  />
                  Confirmo esta excepción únicamente para este lote
                </label>
              </>
            ) : null}
          </div>
        ) : null}
      </details>
      <details className={styles.details}>
        <summary>Notas de este producto</summary>
        <Field>
          <FieldLabel htmlFor={`quick-notes-${line.key}`}>Notas del lote</FieldLabel>
          <Textarea
            id={`quick-notes-${line.key}`}
            maxLength={500}
            value={line.notes}
            onChange={(event) => update({ ...line, notes: event.target.value })}
          />
        </Field>
      </details>
    </section>
  );
}
