'use client';
import { useRouter } from 'next/navigation';
import type { HabitualCatalogOptions } from '@mm/domain';
import type { AppSession } from './app-shell';
import { HabitualProductPicker } from './habitual-product-picker';
import { useRemote } from '@/lib/inventory-api';
import { deviceScope } from '@/lib/receipt-storage';
import { pickerOptions } from '@/lib/receipt-flow';
import { LoadError, LoadingRows } from './operations-ui';
import styles from './receipt-quick.module.css';

export function HabitualCatalog({
  session,
  returnToSale,
}: {
  session: AppSession;
  returnToSale: boolean;
}) {
  const options = useRemote<HabitualCatalogOptions>('/api/catalog/options');
  const router = useRouter();
  return (
    <section className={styles.section} aria-label="Catálogo habitual listo">
      <div className={styles.intro}>
        <div>
          <h2>Catálogo habitual listo</h2>
          <p>
            Elige lo que llegó. Las opciones ya están disponibles; el inventario empieza al guardar
            una recepción con su costo real.
          </p>
        </div>
      </div>
      {options.error ? (
        <LoadError error={options.error} retry={() => void options.reload()} />
      ) : !options.data ? (
        <LoadingRows />
      ) : (
        <HabitualProductPicker
          options={pickerOptions(options.data.options)}
          scope={deviceScope(session.environment, session.user.id)}
          action="Recibir"
          onSelect={(option) => {
            const params = new URLSearchParams({ opcion: option.optionKey });
            if (returnToSale) params.set('returnTo', '/ventas/nueva');
            router.push(`/recepciones?${params}`);
          }}
        />
      )}
    </section>
  );
}
