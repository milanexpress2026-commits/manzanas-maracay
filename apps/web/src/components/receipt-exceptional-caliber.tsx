'use client';
import { useState } from 'react';
import type { HabitualCatalogOptions } from '@mm/domain';
import { useCommand } from '@/lib/inventory-api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { NativeSelect } from './ui/native-select';
import { Field, FieldLabel } from './ui/field';
import { FormError } from './operations-ui';
import styles from './receipt-quick.module.css';

export function ReceiptExceptionalCaliber({
  options,
  reload,
}: {
  options: HabitualCatalogOptions;
  reload: () => Promise<void>;
}) {
  const fruits = [
    ...new Set(
      options.options
        .filter((option) => option.caliberLabel !== null && option.templateId)
        .map((option) => option.fruitName),
    ),
  ];
  const [fruit, setFruit] = useState(fruits[0] ?? 'Manzana');
  const [label, setLabel] = useState('');
  const [saved, setSaved] = useState('');
  const command = useCommand();
  async function save() {
    if (!label.trim()) {
      command.setError('Indica el calibre que aparece en la caja.');
      return;
    }
    try {
      await command.run('/api/catalog/preparation', {
        confirmed: true,
        fruits: [{ name: fruit, varieties: [], calibers: [label.trim()], drafts: [] }],
      });
      await reload();
      setSaved(
        `Calibre ${label.trim()} disponible para ${fruit}. Búscalo arriba; tu recepción se conserva.`,
      );
      setLabel('');
    } catch {
      /* The command owns its error and repeat key. */
    }
  }
  return (
    <details className={styles.details}>
      <summary>+ Nuevo calibre</summary>
      <div className={styles.detailsGrid}>
        <Field>
          <FieldLabel htmlFor="exceptional-fruit">Fruta del calibre</FieldLabel>
          <NativeSelect
            id="exceptional-fruit"
            value={fruit}
            onChange={(event) => {
              setFruit(event.target.value);
              setSaved('');
            }}
          >
            {fruits.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="exceptional-caliber">Nuevo calibre</FieldLabel>
          <Input
            id="exceptional-caliber"
            maxLength={30}
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
              setSaved('');
            }}
          />
        </Field>
      </div>
      <FormError message={command.error} />
      <Button type="button" variant="outline" disabled={command.busy} onClick={() => void save()}>
        {command.busy ? 'Guardando calibre…' : 'Guardar calibre'}
      </Button>
      {saved ? (
        <p role="status" className={styles.help}>
          {saved}
        </p>
      ) : null}
    </details>
  );
}
