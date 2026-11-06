'use client';
import { useState, type FormEvent } from 'react';
import { Info } from 'lucide-react';
import {
  openBoxSchema,
  withdrawBlistersSchema,
  openBlisterSchema,
  prepareHalfSchema,
  adjustmentSchema,
  reversalSchema,
  type LotDetail,
  type InventoryCommandResult,
  type InventoryMovement,
} from '@mm/domain';
import { useCommand } from '@/lib/inventory-api';
import { containerName } from '@/lib/stock-labels';
import { productLabel } from '@/lib/commercial-ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldDescription } from './ui/field';
import { NativeSelect } from './ui/native-select';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { FormError, SaveButton } from './operations-ui';
export type StockAction =
  | {
      kind:
        | 'open-box'
        | 'split-halves'
        | 'open-blister'
        | 'withdraw-blisters'
        | 'prepare-half'
        | 'adjust';
      containerId?: string;
    }
  | { kind: 'reverse'; movement: InventoryMovement };
const titles = {
  'open-box': 'Abrir caja',
  'split-halves': 'Dividir en medias cajas',
  'open-blister': 'Abrir blíster',
  'withdraw-blisters': 'Retirar blíster',
  'prepare-half': 'Preparar media caja',
  adjust: 'Ajustar inventario',
  reverse: 'Revertir movimiento',
};
const confirmations = {
  'open-box': 'Confirmar apertura',
  'split-halves': 'Confirmar división',
  'open-blister': 'Confirmar apertura',
  'withdraw-blisters': 'Confirmar retiro',
  'prepare-half': 'Confirmar media caja',
  adjust: 'Confirmar ajuste',
  reverse: 'Confirmar reversa',
};
export function InventoryOperationDialog({
  action,
  detail,
  onClose,
  onSaved,
}: {
  action: StockAction;
  detail: LotDetail;
  onClose: () => void;
  onSaved: (result: InventoryCommandResult) => Promise<void>;
}) {
  const eligible = detail.containers.filter((c) => {
    if (c.quantity <= 0 || c.state === 'empty' || c.state === 'dispatched') return false;
    if (action.kind === 'open-box' || action.kind === 'split-halves')
      return c.kind === 'box' && c.state === 'sealed';
    if (action.kind === 'open-blister') return c.kind === 'blister' && c.state === 'sealed';
    if (action.kind === 'prepare-half')
      return (
        ((c.kind === 'box' || c.kind === 'blister') && c.state === 'sealed') ||
        c.unit === 'loose_piece'
      );
    return true;
  });
  const [containerId, setContainerId] = useState(
      action.kind === 'reverse' ? '' : (action.containerId ?? ''),
    ),
    [reason, setReason] = useState('');
  const initial = detail.containers.find((c) => c.id === containerId);
  const [quantity, setQuantity] = useState('1'),
    [counted, setCounted] = useState(
      initial?.unit === 'loose_piece' ? String(initial.quantity) : '',
    ),
    [prepared, setPrepared] = useState(''),
    [remaining, setRemaining] = useState(''),
    [delta, setDelta] = useState(''),
    [piecesDelta, setPiecesDelta] = useState('');
  const [review, setReview] = useState<Record<string, unknown> | null>(null);
  const command = useCommand();
  const selected = eligible.find((c) => c.id === containerId);
  const isPhysical = action.kind === 'open-blister' || action.kind === 'prepare-half';
  const chooseContainer = action.kind !== 'withdraw-blisters' && action.kind !== 'reverse';
  function selectContainer(value: string) {
    setContainerId(value);
    const c = detail.containers.find((item) => item.id === value);
    setCounted(c?.unit === 'loose_piece' ? String(c.quantity) : '');
    setPrepared('');
    setRemaining('');
    setDelta('');
    setPiecesDelta('');
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (command.busy) return;
    if (!review) {
      command.setError('');
      let body: unknown, schema;
      if (action.kind === 'withdraw-blisters') {
        body = { quantity: Number(quantity), reason };
        schema = withdrawBlistersSchema;
      } else if (action.kind === 'open-box' || action.kind === 'split-halves') {
        body = { containerId, reason };
        schema = openBoxSchema;
      } else if (action.kind === 'open-blister') {
        body = { containerId, countedPieces: Number(counted), reason };
        schema = openBlisterSchema;
      } else if (action.kind === 'prepare-half') {
        body = {
          containerId,
          countedBefore: Number(counted),
          preparedPieces: Number(prepared),
          remainingPieces: Number(remaining),
          reason,
        };
        schema = prepareHalfSchema;
      } else if (action.kind === 'reverse') {
        body = { reason };
        schema = reversalSchema;
      } else {
        body = {
          containerId,
          quantityDelta: Number(delta),
          ...(detail.lot.packingModel === 'blister'
            ? {
                piecesDelta:
                  selected?.unit === 'loose_piece'
                    ? Number(delta)
                    : piecesDelta === ''
                      ? null
                      : Number(piecesDelta),
              }
            : {}),
          reason,
        };
        schema = adjustmentSchema;
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        command.setError(parsed.error.issues[0]?.message ?? 'Revisa los datos del movimiento.');
        return;
      }
      if (
        action.kind === 'withdraw-blisters' &&
        Number(quantity) > detail.lot.equivalentIntactBlisters
      ) {
        command.setError('No hay suficientes blíster intactos en este lote.');
        return;
      }
      if (action.kind === 'adjust' && selected) {
        const nextQuantity = selected.quantity + Number(delta);
        if (nextQuantity < 0 || (selected.unit !== 'loose_piece' && nextQuantity > 1)) {
          command.setError('El ajuste debe conservar un saldo válido para este contenedor.');
          return;
        }
        if (selected.unit === 'prepared_half_box' && selected.countedPieces !== null) {
          const nextPieces = (selected.countedPieces ?? 0) + Number(piecesDelta || 0);
          if ((nextQuantity === 0 && nextPieces !== 0) || (nextQuantity === 1 && nextPieces <= 0)) {
            command.setError(
              'La media caja debe conservar sus piezas contadas. Si la retiras completa, descuenta también todas sus frutas.',
            );
            return;
          }
        }
      }
      setReview(parsed.data as Record<string, unknown>);
      return;
    }
    const endpoint =
      action.kind === 'reverse'
        ? `/api/inventory/movements/${action.movement.id}/reverse`
        : `/api/inventory/lots/${detail.lot.id}/${action.kind}`;
    try {
      const result = await command.run<InventoryCommandResult>(endpoint, review);
      await onSaved(result);
    } catch {}
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !command.busy) onClose();
      }}
    >
      <DialogContent className="catalog-dialog stock-operation-dialog">
        <DialogHeader>
          <DialogTitle>
            {review ? 'Confirmar: ' : ''}
            {titles[action.kind]}
          </DialogTitle>
          <DialogDescription>
            {productLabel(detail.lot)} · Lote {detail.lot.code}
          </DialogDescription>
        </DialogHeader>
        <form className="catalog-form" onSubmit={submit}>
          <fieldset disabled={command.busy}>
            <FieldGroup>
              {!review ? (
                <>
                  {chooseContainer ? (
                    <Field>
                      <FieldLabel htmlFor="operation-container">Contenedor de origen</FieldLabel>
                      <NativeSelect
                        id="operation-container"
                        required
                        value={containerId}
                        onChange={(e) => selectContainer(e.target.value)}
                      >
                        <option value="">Selecciona el contenedor</option>
                        {eligible.map((c) => (
                          <option key={c.id} value={c.id}>
                            {containerName(c, detail.lot.commercialUnitLabel)}
                            {c.unit === 'loose_piece' ? ` · ${c.quantity} piezas` : ''}
                          </option>
                        ))}
                      </NativeSelect>
                      <FieldDescription>
                        Usa el identificador que aparece en el detalle físico del lote.
                      </FieldDescription>
                    </Field>
                  ) : null}
                  {action.kind === 'split-halves' ? (
                    <Alert>
                      <Info aria-hidden="true" />
                      <AlertDescription>
                        Una caja cerrada se dividirá en dos medias cajas comerciales. No se pide ni
                        se inventa un conteo de frutas.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {action.kind === 'open-box' ? (
                    <Alert>
                      <Info aria-hidden="true" />
                      <AlertDescription>
                        Una caja cerrada pasará a contener {detail.lot.blistersPerBox} blíster
                        intactos. No se agregará stock extra y la cantidad de frutas seguirá siendo
                        desconocida.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {action.kind === 'withdraw-blisters' ? (
                    <>
                      <Field>
                        <FieldLabel htmlFor="withdraw-quantity">Blíster a retirar</FieldLabel>
                        <Input
                          id="withdraw-quantity"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={Math.min(1000, detail.lot.equivalentIntactBlisters)}
                          step={1}
                          required
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                        />
                        <FieldDescription>
                          {detail.lot.equivalentIntactBlisters} blíster equivalentes disponibles en
                          empaques intactos.
                        </FieldDescription>
                      </Field>
                      <Alert>
                        <Info aria-hidden="true" />
                        <AlertDescription>
                          Se usarán primero los blíster de cajas ya abiertas. Si faltan, se abrirán
                          cajas cerradas de este mismo lote. Después verás los contenedores
                          utilizados. Es un retiro interno, sin factura.
                        </AlertDescription>
                      </Alert>
                    </>
                  ) : null}
                  {isPhysical ? (
                    <Field>
                      <FieldLabel htmlFor="physical-count">
                        {action.kind === 'open-blister'
                          ? 'Frutas contadas al abrir el blíster'
                          : 'Frutas contadas antes de preparar'}
                      </FieldLabel>
                      <Input
                        id="physical-count"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100000}
                        step={1}
                        required
                        value={counted}
                        onChange={(e) => setCounted(e.target.value)}
                      />
                      <FieldDescription>
                        Cuenta las piezas reales del contenedor seleccionado. No uses el calibre ni
                        una equivalencia.
                      </FieldDescription>
                    </Field>
                  ) : null}
                  {action.kind === 'prepare-half' ? (
                    <>
                      <div className="operation-form-grid">
                        <Field>
                          <FieldLabel htmlFor="prepared-pieces">
                            Frutas en la media caja preparada
                          </FieldLabel>
                          <Input
                            id="prepared-pieces"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={100000}
                            step={1}
                            required
                            value={prepared}
                            onChange={(e) => setPrepared(e.target.value)}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="remaining-pieces">
                            Frutas que quedan sueltas
                          </FieldLabel>
                          <Input
                            id="remaining-pieces"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={100000}
                            step={1}
                            required
                            value={remaining}
                            onChange={(e) => setRemaining(e.target.value)}
                          />
                        </Field>
                      </div>
                      <p className="count-equation">
                        {counted || '…'} contadas = {prepared || '…'} preparadas +{' '}
                        {remaining || '…'} restantes
                      </p>
                      <FieldDescription>
                        Con 37 frutas, puedes preparar 18 y dejar 19. La media caja se registra como
                        un empaque físico con su propio conteo.
                      </FieldDescription>
                    </>
                  ) : null}
                  {action.kind === 'adjust' ? (
                    <>
                      <Field>
                        <FieldLabel htmlFor="adjust-quantity">
                          {selected?.unit === 'loose_piece'
                            ? 'Cambio en piezas sueltas'
                            : 'Cambio en cantidad de empaques'}
                        </FieldLabel>
                        <Input
                          id="adjust-quantity"
                          type="number"
                          inputMode="numeric"
                          min={selected ? -selected.quantity : -100000}
                          max={
                            selected && selected.unit !== 'loose_piece'
                              ? 1 - selected.quantity
                              : 100000
                          }
                          step={1}
                          required
                          value={delta}
                          placeholder="Ejemplo: -1"
                          onChange={(e) => {
                            setDelta(e.target.value);
                            if (
                              selected?.unit === 'prepared_half_box' &&
                              selected.countedPieces !== null &&
                              e.target.value === '-1'
                            )
                              setPiecesDelta(String(-selected.countedPieces));
                          }}
                        />
                        <FieldDescription>
                          {selected
                            ? `Saldo actual: ${selected.quantity} ${selected.unit === 'loose_piece' ? 'piezas' : 'empaque'}. `
                            : ''}
                          Valor negativo para descontar; positivo para corregir un faltante
                          documentado. No reemplaza el registro de una nueva recepción.
                        </FieldDescription>
                      </Field>
                      {selected &&
                      selected.unit !== 'loose_piece' &&
                      detail.lot.packingModel === 'blister' ? (
                        <Field>
                          <FieldLabel htmlFor="adjust-pieces">Cambio en frutas contadas</FieldLabel>
                          <Input
                            id="adjust-pieces"
                            type="number"
                            inputMode="numeric"
                            min={-100000}
                            max={100000}
                            step={1}
                            value={piecesDelta}
                            disabled={selected.countedPieces === null}
                            onChange={(e) => setPiecesDelta(e.target.value)}
                          />
                          <FieldDescription>
                            {selected.countedPieces === null
                              ? 'El conteo de este empaque es desconocido y debe permanecer así.'
                              : `El contenedor registra ${selected.countedPieces} frutas. Al retirar un empaque preparado completo también descuenta sus piezas.`}
                          </FieldDescription>
                        </Field>
                      ) : null}
                    </>
                  ) : null}
                  {action.kind === 'reverse' ? (
                    <Alert>
                      <Info aria-hidden="true" />
                      <AlertDescription>
                        <p>
                          Se registrará un nuevo movimiento que compensa{' '}
                          {action.movement.id.slice(0, 8)}. El historial original se conserva.
                        </p>
                        <p>
                          Solo se permite si no hay movimientos posteriores que dependan de este
                          estado.
                        </p>
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <Field>
                    <FieldLabel htmlFor="operation-reason">Motivo del movimiento</FieldLabel>
                    <Textarea
                      id="operation-reason"
                      required
                      minLength={5}
                      maxLength={500}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Explica qué ocurrió y por qué realizas este movimiento…"
                    />
                  </Field>
                </>
              ) : (
                <div className="movement-review">
                  <h3>Revisa antes de guardar</h3>
                  {selected ? (
                    <p>
                      <strong>Origen:</strong>{' '}
                      {containerName(selected, detail.lot.commercialUnitLabel)}
                    </p>
                  ) : null}
                  {action.kind === 'withdraw-blisters' ? (
                    <p>
                      <strong>Retiro interno:</strong> {String(review.quantity)} blíster intactos.
                    </p>
                  ) : null}
                  {action.kind === 'split-halves' ? (
                    <p>Se conservarán dos medias cajas comerciales a partir de una caja cerrada.</p>
                  ) : null}
                  {action.kind === 'open-box' ? (
                    <p>
                      Se abrirá 1 caja y se conservarán sus {detail.lot.blistersPerBox} blíster.
                    </p>
                  ) : null}
                  {action.kind === 'open-blister' ? (
                    <p>
                      <strong>Conteo real:</strong> {String(review.countedPieces)} frutas sueltas.
                    </p>
                  ) : null}
                  {action.kind === 'prepare-half' ? (
                    <p>
                      <strong>{String(review.countedBefore)} frutas</strong> ={' '}
                      {String(review.preparedPieces)} preparadas + {String(review.remainingPieces)}{' '}
                      restantes.
                    </p>
                  ) : null}
                  {action.kind === 'adjust' ? (
                    <p>
                      <strong>Ajuste:</strong> {String(review.quantityDelta)}{' '}
                      {selected?.unit === 'loose_piece' ? 'piezas' : 'empaques'}
                      {review.piecesDelta !== null
                        ? `; ${String(review.piecesDelta)} frutas contadas`
                        : ''}
                      .
                    </p>
                  ) : null}
                  {action.kind === 'reverse' ? (
                    <p>
                      Reversa del movimiento {action.movement.id.slice(0, 8)}. Se comprobará que su
                      estado no haya cambiado.
                    </p>
                  ) : null}
                  <p>
                    <strong>Motivo:</strong> {String(review.reason)}
                  </p>
                  <p>El movimiento actualizará el stock y quedará registrado con tu usuario.</p>
                </div>
              )}
            </FieldGroup>
          </fieldset>
          <FormError message={command.error} />
          <div className="form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={command.busy}
              onClick={() => (review ? setReview(null) : onClose())}
            >
              {review ? 'Volver a editar' : 'Cancelar'}
            </Button>
            <SaveButton busy={command.busy}>
              {review ? confirmations[action.kind] : 'Revisar movimiento'}
            </SaveButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
