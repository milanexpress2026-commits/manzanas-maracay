'use client';
import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { NativeSelect } from './ui/native-select';
import { Field, FieldDescription, FieldLabel } from './ui/field';
import styles from './product-form.module.css';

export function ProductCatalogField({
  id,
  label,
  noun,
  options,
  value,
  onChange,
  onCreate,
  busy,
  disabled = false,
  optional = false,
  help,
  placeholder,
  initialCreate = false,
}: {
  id: string;
  label: string;
  noun: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  busy: boolean;
  disabled?: boolean;
  optional?: boolean;
  help: string;
  placeholder: string;
  initialCreate?: boolean;
}) {
  const [creating, setCreating] = useState(initialCreate);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const selectRef = useRef<HTMLSelectElement>(null);
  const visible = options.filter(
    (option) =>
      option.id === value ||
      option.label.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es')),
  );
  async function create() {
    if (await onCreate(name)) {
      setCreating(false);
      setName('');
      setSearch('');
      requestAnimationFrame(() => selectRef.current?.focus());
    }
  }
  return (
    <Field className={styles.catalogField}>
      <div className={styles.fieldHeading}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || busy}
          aria-expanded={creating}
          aria-controls={`${id}-create`}
          onClick={() => setCreating((open) => !open)}
        >
          <Plus aria-hidden="true" />
          Crear {noun}
        </Button>
      </div>
      {options.length > 8 && !creating ? (
        <Input
          type="search"
          aria-label={`Buscar ${noun}`}
          value={search}
          placeholder={`Buscar ${noun}…`}
          disabled={disabled || busy}
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}
      <NativeSelect
        id={id}
        ref={selectRef}
        value={value}
        disabled={disabled || busy}
        aria-describedby={`${id}-help`}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          Selecciona o crea{' '}
          {noun === 'fruta' ? 'una fruta' : noun === 'variedad' ? 'una variedad' : 'un calibre'}
        </option>
        {optional ? <option value="none">No aplica a este producto</option> : null}
        {visible.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      <FieldDescription id={`${id}-help`}>{help}</FieldDescription>
      {creating ? (
        <div className={styles.inlineCreate} id={`${id}-create`}>
          <FieldLabel htmlFor={`${id}-name`}>
            {noun === 'calibre' ? 'Nuevo calibre' : `Nombre de la ${noun}`}
          </FieldLabel>
          <Input
            id={`${id}-name`}
            value={name}
            autoFocus
            disabled={busy || disabled}
            placeholder={placeholder}
            maxLength={noun === 'calibre' ? 30 : 80}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void create();
              }
            }}
          />
          <div className={styles.inlineActions}>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || disabled || !name.trim()}
              onClick={() => void create()}
            >
              {busy ? 'Guardando…' : `Guardar ${noun}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setCreating(false);
                requestAnimationFrame(() => selectRef.current?.focus());
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </Field>
  );
}
