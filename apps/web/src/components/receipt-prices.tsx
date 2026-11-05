'use client';
import Decimal from 'decimal.js';
import type { Configuration, Presentation } from '@mm/domain';
import { Input } from './ui/input';
import { Field, FieldLabel } from './ui/field';
import { normalizedMoney, presentationNames } from '@/lib/commercial-ui';
import { displayMoney } from '@/lib/inventory-api';
type Line = {
  key: number;
  cost: string;
  boxes: string;
  priceAction: 'keep' | 'update';
  prices: { presentation: Presentation; promoUsd: string; regularUsd: string }[];
};
export function ReceiptPrices({
  line,
  config,
  update,
}: {
  line: Line;
  config: Configuration;
  update: (changes: Partial<Line>) => void;
}) {
  const boxPrice = line.prices.find((p) => p.presentation === 'box')?.promoUsd;
  let gross: string | null = null;
  try {
    if (boxPrice && line.cost && Number.isInteger(Number(line.boxes)))
      gross = new Decimal(normalizedMoney(boxPrice))
        .minus(normalizedMoney(line.cost))
        .times(line.boxes)
        .toFixed(2);
  } catch {}
  return (
    <fieldset className="price-editor">
      <legend>Precios de venta por presentación</legend>
      <div className="price-choice">
        <label>
          <input
            type="radio"
            name={'price-action-' + line.key}
            checked={line.priceAction === 'keep'}
            onChange={() => update({ priceAction: 'keep' })}
          />
          Conservar precios
        </label>
        <label>
          <input
            type="radio"
            name={'price-action-' + line.key}
            checked={line.priceAction === 'update'}
            onChange={() => update({ priceAction: 'update' })}
          />
          Actualizar precios
        </label>
      </div>
      <div className="prices-grid">
        {line.prices.map((price, index) => (
          <div className="contents" key={price.presentation}>
            <p className="price-presentation">{presentationNames[price.presentation]}</p>
            <Field>
              <FieldLabel htmlFor={'receipt-promo-' + line.key + '-' + index}>
                Promocional USD efectivo
              </FieldLabel>
              <Input
                id={'receipt-promo-' + line.key + '-' + index}
                inputMode="decimal"
                readOnly={line.priceAction === 'keep'}
                required={
                  line.priceAction === 'update' &&
                  Boolean(price.promoUsd.trim() || price.regularUsd.trim())
                }
                value={price.promoUsd}
                placeholder="Sin configurar…"
                onChange={(e) =>
                  update({
                    prices: line.prices.map((p, i) =>
                      i === index ? { ...p, promoUsd: e.target.value } : p,
                    ),
                  })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={'receipt-regular-' + line.key + '-' + index}>
                Normal USD para VES
              </FieldLabel>
              <Input
                id={'receipt-regular-' + line.key + '-' + index}
                inputMode="decimal"
                readOnly={line.priceAction === 'keep'}
                required={
                  line.priceAction === 'update' &&
                  Boolean(price.promoUsd.trim() || price.regularUsd.trim())
                }
                value={price.regularUsd}
                placeholder="Sin configurar…"
                onChange={(e) =>
                  update({
                    prices: line.prices.map((p, i) =>
                      i === index ? { ...p, regularUsd: e.target.value } : p,
                    ),
                  })
                }
              />
            </Field>
          </div>
        ))}
      </div>
      <p className="commercial-help">
        Las referencias son independientes del costo. No se derivan precios de media caja o blíster
        del precio de la caja. Los pares vacíos no se actualizan; completa ambos importes de cada
        presentación que elijas.
      </p>
      {gross !== null ? (
        <p className="commercial-help">
          Estimación de ganancia bruta vendiendo estas cajas al precio promocional:{' '}
          <strong>{displayMoney(gross)}</strong>. Sin gastos accesorios.
        </p>
      ) : null}
      {config.confirmationStatus === 'pending' ? (
        <p className="commercial-help">
          Configuración comercial pendiente de confirmar; no se inventa su contenido.
        </p>
      ) : null}
    </fieldset>
  );
}
