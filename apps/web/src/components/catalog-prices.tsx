'use client';
import { useState, type FormEvent } from 'react';
import { updatePricesSchema, type Configuration } from '@mm/domain';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Field, FieldLabel } from './ui/field';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { FormError, SaveButton } from './operations-ui';
import { displayMoney, useCommand } from '@/lib/inventory-api';
import { normalizedMoney, presentationNames } from '@/lib/commercial-ui';
export function CatalogPrices({
  configuration,
  onSaved,
}: {
  configuration: Configuration;
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [prices, setPrices] = useState(() =>
    configuration.allowedPresentations.map((presentation) => ({
      presentation,
      promoUsd: configuration.prices.find((p) => p.presentation === presentation)?.promoUsd ?? '',
      regularUsd:
        configuration.prices.find((p) => p.presentation === presentation)?.regularUsd ?? '',
    })),
  );
  const command = useCommand();
  async function submit(e: FormEvent) {
    e.preventDefault();
    command.setError('');
    const parsed = updatePricesSchema.safeParse({
      items: prices
        .filter((p) => p.promoUsd.trim() || p.regularUsd.trim())
        .map((p) => ({
          ...p,
          variantId: configuration.variantId,
          promoUsd: normalizedMoney(p.promoUsd),
          regularUsd: normalizedMoney(p.regularUsd),
        })),
    });
    if (!parsed.success) {
      command.setError(parsed.error.issues[0]?.message ?? 'Revisa los precios.');
      return;
    }
    try {
      await command.run('/api/prices', parsed.data);
      await onSaved();
      setOpen(false);
    } catch {}
  }
  return (
    <div className="configuration-price-list">
      <h4>Precios por presentación</h4>
      <dl>
        {configuration.allowedPresentations.map((p) => {
          const price = configuration.prices.find((item) => item.presentation === p);
          return (
            <div key={p}>
              <dt>{presentationNames[p]}</dt>
              <dd>
                Promocional:{' '}
                {price?.promoUsd != null ? displayMoney(price.promoUsd) : 'Sin configurar'}
              </dd>
              <dd>
                Normal:{' '}
                {price?.regularUsd != null ? displayMoney(price.regularUsd) : 'Sin configurar'}
              </dd>
            </div>
          );
        })}
      </dl>
      <Button
        variant="outline"
        onClick={() => {
          setPrices(
            configuration.allowedPresentations.map((presentation) => ({
              presentation,
              promoUsd:
                configuration.prices.find((p) => p.presentation === presentation)?.promoUsd ?? '',
              regularUsd:
                configuration.prices.find((p) => p.presentation === presentation)?.regularUsd ?? '',
            })),
          );
          setOpen(true);
        }}
      >
        Editar precios
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!command.busy) setOpen(value);
        }}
      >
        <DialogContent className="catalog-dialog">
          <DialogHeader>
            <DialogTitle>Precios de venta</DialogTitle>
            <DialogDescription>
              Referencias en USD independientes del costo de compra. Cada presentación tiene su
              propio precio.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit}>
            <fieldset disabled={command.busy}>
              <div className="prices-grid">
                {prices.map((price, index) => (
                  <div className="contents" key={price.presentation}>
                    <p className="price-presentation">{presentationNames[price.presentation]}</p>
                    <Field>
                      <FieldLabel htmlFor={`promo-${index}`}>Promocional USD efectivo</FieldLabel>
                      <Input
                        id={`promo-${index}`}
                        required={Boolean(price.promoUsd.trim() || price.regularUsd.trim())}
                        inputMode="decimal"
                        value={price.promoUsd}
                        onChange={(e) =>
                          setPrices((current) =>
                            current.map((p, i) =>
                              i === index ? { ...p, promoUsd: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`regular-${index}`}>Normal USD para VES</FieldLabel>
                      <Input
                        id={`regular-${index}`}
                        required={Boolean(price.promoUsd.trim() || price.regularUsd.trim())}
                        inputMode="decimal"
                        value={price.regularUsd}
                        onChange={(e) =>
                          setPrices((current) =>
                            current.map((p, i) =>
                              i === index ? { ...p, regularUsd: e.target.value } : p,
                            ),
                          )
                        }
                      />
                    </Field>
                  </div>
                ))}
              </div>
              <p className="commercial-help">
                Completa ambos precios de las presentaciones que quieras actualizar. Los pares
                vacíos se conservan sin configurar; no borran precios existentes. Estos cambios no
                modifican ventas ya confirmadas.
              </p>
              <FormError message={command.error} />
              <div className="form-actions">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <SaveButton busy={command.busy}>Actualizar precios</SaveButton>
              </div>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
