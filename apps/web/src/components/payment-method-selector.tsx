'use client';
import type { SettlementBasis } from '@mm/domain';
import { ChevronDown } from 'lucide-react';
import {
  paymentChoices,
  paymentChoiceDetails,
  paymentChoiceUnavailable,
  type PaymentChoice,
} from '@/lib/sales-flow';
import { Field, FieldDescription, FieldLabel } from './ui/field';
import { NativeSelect } from './ui/native-select';
import styles from './sales-flow.module.css';

export function PaymentMethodSelector({
  id,
  value,
  onChange,
  basis,
  quotes,
  mixed = false,
  label = 'Método de cobro',
}: {
  id: string;
  value: PaymentChoice;
  onChange: (value: PaymentChoice) => void;
  basis: SettlementBasis | null;
  quotes: { bcv: boolean; usdt: boolean };
  mixed?: boolean;
  label?: string;
}) {
  const options = paymentChoices.map((option) => ({
    ...option,
    reason: paymentChoiceUnavailable(option.id, basis, quotes, mixed),
  }));
  const selected = paymentChoiceDetails(value);
  const issue = options.find((option) => option.id === value)?.reason;
  return (
    <Field className={styles.paymentMethod}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        value={value}
        required
        aria-invalid={!!issue}
        aria-describedby={id + '-help'}
        onChange={(event) => {
          const option = options.find((item) => item.id === event.target.value);
          if (option && !option.reason) onChange(option.id);
        }}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={!!option.reason}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      <FieldDescription id={id + '-help'}>
        {selected.currency === 'VES'
          ? 'Recibes bolívares. La cotización corresponde al acuerdo original.'
          : selected.currency === 'USDT'
            ? 'Recibes USDT; se aplica 1:1 a la deuda en USD.'
            : 'Recibes dólares en efectivo.'}
      </FieldDescription>
      {issue ? (
        <p role="alert" className={styles.methodIssue}>
          {issue}
        </p>
      ) : null}
      {options.some((option) => option.reason) ? (
        <details className={styles.methodHelp}>
          <summary>
            Opciones no disponibles <ChevronDown aria-hidden="true" size={16} />
          </summary>
          <ul>
            {options
              .filter((option) => option.reason)
              .map((option) => (
                <li key={option.id}>
                  <strong>{option.label}:</strong> {option.reason}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </Field>
  );
}
