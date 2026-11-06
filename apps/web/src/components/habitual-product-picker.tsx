'use client';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, Search, Star } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { NativeSelect } from './ui/native-select';
import { Field, FieldLabel } from './ui/field';
import {
  emptyPreferences,
  readPreferences,
  writePreferences,
  togglePreference,
  type DevicePreferences,
} from '@/lib/receipt-storage';
import styles from './receipt-quick.module.css';
import { productSearchMatches, type PickerOption } from '@/lib/receipt-flow';

export function HabitualProductPicker({
  options,
  scope,
  onSelect,
  action = 'Elegir',
  id = 'habitual',
}: {
  options: PickerOption[];
  scope: string;
  onSelect: (option: PickerOption) => void;
  action?: string;
  id?: string;
}) {
  const [query, setQuery] = useState('');
  const [fruit, setFruit] = useState('all');
  const [filter, setFilter] = useState<'all' | 'favorites' | 'recent' | 'hidden'>('all');
  const [preferences, setPreferences] = useState<DevicePreferences>(emptyPreferences);
  const [limit, setLimit] = useState(12);
  const [error, setError] = useState('');
  useEffect(() => {
    setPreferences(readPreferences(localStorage, scope));
  }, [scope]);
  function update(next: DevicePreferences) {
    setPreferences(next);
    try {
      writePreferences(localStorage, scope, next);
      setError('');
    } catch {
      setError(
        'El dispositivo no pudo conservar tus preferencias. Puedes seguir eligiendo productos.',
      );
    }
  }
  const fruits = [...new Set(options.map((option) => option.fruit))];
  const filtered = options
    .filter(
      (option) =>
        (fruit === 'all' || option.fruit === fruit) &&
        productSearchMatches(option.label, option.description, query) &&
        (filter === 'hidden'
          ? preferences.hidden.includes(option.optionKey)
          : !preferences.hidden.includes(option.optionKey)) &&
        (filter !== 'favorites' || preferences.favorites.includes(option.optionKey)) &&
        (filter !== 'recent' || preferences.recent.includes(option.optionKey)),
    )
    .sort((a, b) =>
      filter === 'recent'
        ? preferences.recent.indexOf(a.optionKey) - preferences.recent.indexOf(b.optionKey)
        : Number(preferences.favorites.includes(b.optionKey)) -
          Number(preferences.favorites.includes(a.optionKey)),
    );
  return (
    <section className={styles.picker} aria-label="Productos habituales y del catálogo">
      <div className={styles.pickerSearch}>
        <Field>
          <FieldLabel htmlFor={`${id}-search`}>Buscar producto</FieldLabel>
          <div className={styles.searchInput}>
            <Search aria-hidden="true" />
            <Input
              id={`${id}-search`}
              value={query}
              placeholder="Gala 113, roja 88, kiwi…"
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(12);
              }}
            />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-fruit`}>Fruta</FieldLabel>
          <NativeSelect
            id={`${id}-fruit`}
            value={fruit}
            onChange={(event) => {
              setFruit(event.target.value);
              setLimit(12);
            }}
          >
            <option value="all">Todas las frutas</option>
            {fruits.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className={styles.filters} role="group" aria-label="Ver productos">
        {(
          [
            ['all', 'Todos'],
            ['favorites', 'Favoritos'],
            ['recent', 'Recientes'],
            ['hidden', 'Ocultos'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={filter === key ? 'default' : 'outline'}
            aria-pressed={filter === key}
            onClick={() => {
              setFilter(key);
              setLimit(12);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <p className={styles.help}>
        {filtered.length} opciones · Son productos disponibles para elegir; no indican existencias.
      </p>
      {filtered.length ? (
        <ul className={styles.optionList}>
          {filtered.slice(0, limit).map((option) => (
            <li key={option.optionKey}>
              <button
                type="button"
                className={styles.chooseOption}
                onClick={() => onSelect(option)}
                aria-label={`${action} ${option.label}`}
              >
                <strong>{option.label}</strong>
                <span>
                  {option.needsPresentation
                    ? 'Confirmar presentación al recibir'
                    : option.description}
                </span>
              </button>
              <div className={styles.optionActions}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`${preferences.favorites.includes(option.optionKey) ? 'Quitar de favoritos' : 'Añadir a favoritos'} ${option.label}`}
                  aria-pressed={preferences.favorites.includes(option.optionKey)}
                  onClick={() =>
                    update({
                      ...preferences,
                      favorites: togglePreference(preferences.favorites, option.optionKey),
                    })
                  }
                >
                  <Star
                    aria-hidden="true"
                    fill={
                      preferences.favorites.includes(option.optionKey) ? 'currentColor' : 'none'
                    }
                  />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`${preferences.hidden.includes(option.optionKey) ? 'Mostrar' : 'Ocultar'} ${option.label}`}
                  onClick={() =>
                    update({
                      ...preferences,
                      hidden: togglePreference(preferences.hidden, option.optionKey),
                    })
                  }
                >
                  {preferences.hidden.includes(option.optionKey) ? (
                    <Eye aria-hidden="true" />
                  ) : (
                    <EyeOff aria-hidden="true" />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          No hay productos con este filtro. Prueba otro nombre o vuelve a Todos.
        </p>
      )}
      {filtered.length > limit ? (
        <Button type="button" variant="outline" onClick={() => setLimit((current) => current + 12)}>
          Ver más productos
        </Button>
      ) : null}
      {filter === 'hidden' && preferences.hidden.length ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => update({ ...preferences, hidden: [] })}
        >
          Mostrar todos los productos ocultos
        </Button>
      ) : null}
      {error ? (
        <p role="status" className={styles.help}>
          {error}
        </p>
      ) : null}
      <p className={styles.help}>
        Favoritos y ocultos se guardan solo en este dispositivo, para tu acceso.
      </p>
    </section>
  );
}
