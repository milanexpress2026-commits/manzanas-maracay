'use client';
import type { Configuration, HalfPreparation, PackingModel, Presentation } from '@mm/domain';
import { Field, FieldDescription, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { NativeSelect } from './ui/native-select';
import { presentationNames } from '@/lib/commercial-ui';
import styles from './catalog-preparation.module.css';

export type PackingReviewValue = Pick<
  Configuration,
  'packingModel' | 'halfPreparation' | 'allowedPresentations' | 'blistersPerBox' | 'boxWeightKg'
>;

export function PackingReviewFields({
  id,
  value,
  onChange,
  suggestion = null,
  fixedBlisters = null,
  fixedModel = false,
  fixedWeight = false,
}: {
  id: string;
  value: PackingReviewValue;
  onChange: (value: PackingReviewValue) => void;
  suggestion?: number | null;
  fixedBlisters?: number | null;
  fixedModel?: boolean;
  fixedWeight?: boolean;
}) {
  function model(packingModel: PackingModel) {
    onChange({
      ...value,
      packingModel,
      blistersPerBox: null,
      halfPreparation:
        packingModel === 'whole' ? 'none' : packingModel === 'halves' ? 'commercial' : 'pending',
      allowedPresentations: packingModel === 'halves' ? ['box', 'half_box'] : ['box'],
      boxWeightKg: null,
    });
  }
  return (
    <div className={styles.packingFields}>
      <Field>
        <FieldLabel htmlFor={`${id}-model`}>Presentación de la caja</FieldLabel>
        <NativeSelect
          id={`${id}-model`}
          value={value.packingModel}
          disabled={fixedModel}
          onChange={(event) => model(event.target.value as PackingModel)}
        >
          <option value="blister">Caja con blíster</option>
          <option value="halves">Caja y media caja comercial</option>
          <option value="whole">Solo caja completa</option>
        </NativeSelect>
      </Field>
      {value.packingModel === 'blister' ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-blisters`}>Blíster por caja</FieldLabel>
            {suggestion !== null ? (
              <FieldDescription>
                Cantidad sugerida según audio: {suggestion}; verificar. No confirma este lote.
              </FieldDescription>
            ) : null}
            <Input
              id={`${id}-blisters`}
              type="number"
              min={1}
              max={100}
              step={1}
              inputMode="numeric"
              placeholder="Pendiente de verificar"
              value={value.blistersPerBox ?? ''}
              readOnly={fixedBlisters !== null}
              onChange={(event) =>
                onChange({
                  ...value,
                  blistersPerBox: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
            {fixedBlisters !== null ? (
              <FieldDescription>
                Empaque habitual confirmado. Para una cantidad distinta, usa la excepción de este
                lote.
              </FieldDescription>
            ) : null}
          </Field>
          <fieldset className={styles.choices}>
            <legend>Presentaciones que se podrán vender</legend>
            {(['box', 'half_box', 'blister'] as Presentation[]).map((presentation) => (
              <label key={presentation}>
                <input
                  type="checkbox"
                  checked={value.allowedPresentations.includes(presentation)}
                  disabled={presentation === 'box'}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      allowedPresentations: event.target.checked
                        ? [...value.allowedPresentations, presentation]
                        : value.allowedPresentations.filter((item) => item !== presentation),
                      ...(presentation === 'half_box'
                        ? { halfPreparation: event.target.checked ? 'pending' : 'none' }
                        : {}),
                    })
                  }
                />
                {presentationNames[presentation]}
              </label>
            ))}
          </fieldset>
          {value.allowedPresentations.includes('half_box') ? (
            <Field>
              <FieldLabel htmlFor={`${id}-half`}>Preparación de media caja</FieldLabel>
              <NativeSelect
                id={`${id}-half`}
                value={value.halfPreparation}
                onChange={(event) =>
                  onChange({ ...value, halfPreparation: event.target.value as HalfPreparation })
                }
              >
                <option value="pending">Pendiente de verificar</option>
                <option value="counted">Contar las frutas al abrir la caja</option>
              </NativeSelect>
              <FieldDescription>
                Se contará la cantidad real al abrir. El calibre no cuenta frutas.
              </FieldDescription>
            </Field>
          ) : null}
        </>
      ) : (
        <p className={styles.help}>
          {value.packingModel === 'whole'
            ? 'Solo caja completa; sin blíster ni medias.'
            : 'Caja y media comercial: dos medias por caja, sin contar piezas.'}
        </p>
      )}
      {value.packingModel === 'halves' || value.boxWeightKg !== null ? (
        <Field>
          <FieldLabel htmlFor={`${id}-weight`}>Peso definido por caja, si aplica (kg)</FieldLabel>
          <Input
            id={`${id}-weight`}
            inputMode="decimal"
            placeholder="Sin peso definido"
            value={value.boxWeightKg ?? ''}
            readOnly={fixedWeight}
            onChange={(event) =>
              onChange({ ...value, boxWeightKg: event.target.value.trim() || null })
            }
          />
          <FieldDescription>
            {fixedWeight
              ? 'Se conserva el peso de la presentación habitual; no se pesa cada venta.'
              : 'Es la referencia comercial de la caja; no se pesa cada venta.'}
          </FieldDescription>
        </Field>
      ) : null}
    </div>
  );
}
