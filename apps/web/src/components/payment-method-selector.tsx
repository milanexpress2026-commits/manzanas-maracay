'use client';
import { paymentMethodOptions, type PaymentCurrency } from '@mm/domain';
export type { PaymentCurrency } from '@mm/domain';
import { Field, FieldDescription, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { NativeSelect } from './ui/native-select';

export const defaultPaymentMethod = (currency: PaymentCurrency) =>
  paymentMethodOptions.find((option) => option.currency === currency)?.id ?? '';

export function PaymentMethodSelector({
  id,
  currency,
  value,
  onChange,
  label = 'Método de cobro',
}: {
  id: string;
  currency: PaymentCurrency;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const options = [
    ...paymentMethodOptions
      .filter((option) => option.currency === currency)
      .map((option) => ({ value: option.id, label: option.label, enabled: true })),
    { value: 'Transferencia', label: 'Transferencia bancaria · por confirmar', enabled: false },
    { value: 'Pago móvil', label: 'Pago móvil · por confirmar', enabled: false },
    { value: 'Punto de venta', label: 'Punto de venta · por confirmar', enabled: false },
    { value: 'other', label: 'Otro… · por confirmar', enabled: false },
  ];
  const other = value.startsWith('Otro: ');
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        value={other ? 'other' : value}
        required
        onChange={(e) => onChange(e.target.value === 'other' ? 'Otro: ' : e.target.value)}
      >
        <option value="">Selecciona el método</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={!option.enabled}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      {other ? (
        <>
          <FieldLabel htmlFor={id + '-other'}>Especifica el método</FieldLabel>
          <Input
            id={id + '-other'}
            value={value.slice(6)}
            required
            minLength={2}
            maxLength={60}
            onChange={(e) => onChange('Otro: ' + e.target.value)}
          />
        </>
      ) : null}
      {currency === 'VES' ? (
        <FieldDescription>
          El registro identifica el cobro en bolívares; no realiza una transferencia bancaria.
        </FieldDescription>
      ) : null}
    </Field>
  );
}
