'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Boxes,
  Box,
  Layers3,
  Apple,
  Search,
  Plus,
  RefreshCw,
  ArrowRight,
  ChevronRight,
  History,
  Settings2,
  Undo2,
  PackageOpen,
  Scissors,
  ArrowUpRight,
  Info,
} from 'lucide-react';
import type {
  InventoryOverview,
  StockSummary,
  LotSummary,
  LotDetail,
  ContainerStock,
  InventoryMovement,
} from '@mm/domain';
import { AppShell, type AppSession } from './app-shell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { NativeSelect } from './ui/native-select';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Field, FieldLabel } from './ui/field';
import { LoadError, LoadingRows, SavedNotice, PageFooter } from './operations-ui';
import { displayDate, displayMoney, useRemote } from '@/lib/inventory-api';
import { InventoryOperationDialog, type StockAction } from './inventory-operation-dialog';
import { containerName } from '@/lib/stock-labels';
import { packingLabel, productLabel } from '@/lib/commercial-ui';
const stateNames = { sealed: 'Cerrado', open: 'Abierto', empty: 'Vacío', dispatched: 'Retirado' };
const movementNames: Record<InventoryMovement['kind'], string> = {
  receipt: 'Recepción',
  dispatch: 'Retiro interno',
  open_box: 'Apertura de caja',
  open_blister: 'Apertura de blíster',
  fraction: 'Media caja preparada',
  commercial_split: 'Caja dividida en dos medias',
  adjustment: 'Ajuste de inventario',
  transfer: 'Traslado',
  reversal: 'Reversa',
};
function hasStock(lot: StockSummary) {
  return (
    lot.closedBoxes +
      lot.intactBlisters +
      lot.preparedHalfBoxes +
      lot.loosePieces +
      (lot.fractionalBoxes ?? 0) >
    0
  );
}
export function StockTotals({
  stock,
  model,
  commercialUnitLabel,
}: {
  stock: StockSummary;
  model?: 'blister' | 'halves' | 'whole';
  commercialUnitLabel?: string | null;
}) {
  return (
    <div className="stock-totals" aria-label="Existencias físicas">
      {(stock.fractionalBoxes ?? 0) > 0 ? (
        <div>
          <Boxes aria-hidden="true" />
          <span>Remanente de cajas</span>
          <strong>
            {stock.fractionalBoxes.toLocaleString('es-VE', { maximumFractionDigits: 3 })}
          </strong>
          <small>Disponible para vender medias cajas o blíster</small>
        </div>
      ) : null}
      <div>
        <Box aria-hidden="true" />
        <span>
          {commercialUnitLabel
            ? 'Unidades cerradas'
            : model
              ? 'Cajas cerradas'
              : 'Cajas y unidades cerradas'}
        </span>
        <strong>{stock.closedBoxes}</strong>
        <small>
          {model === 'whole'
            ? (commercialUnitLabel ?? 'Presentaciones completas')
            : model === 'halves'
              ? 'Unidades físicas completas'
              : `${stock.openBoxes} cajas abiertas como contenedores`}
        </small>
      </div>
      {!model || model === 'blister' ? (
        <div>
          <Layers3 aria-hidden="true" />
          <span>Blíster intactos</span>
          <strong>{stock.intactBlisters}</strong>
          <small>Disponibles en cajas abiertas</small>
        </div>
      ) : null}
      {model !== 'whole' ? (
        <div>
          <Boxes aria-hidden="true" />
          <span>Medias cajas</span>
          <strong>{stock.preparedHalfBoxes}</strong>
          <small>
            {model === 'halves'
              ? 'Mitades comerciales, sin conteo de piezas'
              : model === 'blister'
                ? `${stock.preparedPieces} piezas contadas y preparadas`
                : `${stock.preparedPieces} piezas en medias preparadas por conteo`}
          </small>
        </div>
      ) : null}
      {!model || model === 'blister' ? (
        <div>
          <Apple aria-hidden="true" />
          <span>Fruta suelta</span>
          <strong>{stock.loosePieces}</strong>
          <small>{stock.openBlisters} blíster abiertos</small>
        </div>
      ) : null}
    </div>
  );
}
export function InventoryScreen({
  session,
  initialLotId,
}: {
  session: AppSession;
  initialLotId?: string;
}) {
  const inventory = useRemote<InventoryOverview>('/api/inventory');
  const [query, setQuery] = useState(''),
    [fruit, setFruit] = useState('all'),
    [variety, setVariety] = useState('all'),
    [caliber, setCaliber] = useState('all'),
    [physical, setPhysical] = useState('all');
  const all = inventory.data?.lots ?? [];
  const fruits = [...new Map(all.map((lot) => [lot.fruitId, lot.fruit])).entries()];
  const varieties = [
    ...new Map(
      all
        .filter((lot) => fruit === 'all' || lot.fruitId === fruit)
        .filter((lot) => lot.varietyId !== null)
        .map((lot) => [lot.varietyId!, lot.variety!]),
    ).entries(),
  ];
  const calibers = [
    ...new Map(
      all
        .filter((lot) => fruit === 'all' || lot.fruitId === fruit)
        .filter((lot) => lot.caliberId !== null)
        .map((lot) => [lot.caliberId!, lot.caliber!]),
    ).entries(),
  ];
  const filtered = all.filter(
    (lot) =>
      (fruit === 'all' || lot.fruitId === fruit) &&
      (variety === 'all' || lot.varietyId === variety) &&
      (caliber === 'all' || lot.caliberId === caliber) &&
      `${lot.code} ${lot.fruit} ${lot.variety ?? ''} ${lot.caliber ?? ''} ${lot.supplier ?? 'Sin proveedor indicado'}`
        .toLocaleLowerCase('es')
        .includes(query.trim().toLocaleLowerCase('es')) &&
      (physical === 'all' ||
        (physical === 'closed' && lot.closedBoxes > 0) ||
        (physical === 'open' && lot.openBoxes > 0) ||
        (physical === 'halves' && (lot.preparedHalfBoxes > 0 || lot.fractionalBoxes >= 0.5)) ||
        (physical === 'loose' && lot.loosePieces > 0) ||
        (physical === 'empty' && !hasStock(lot))),
  );
  function clearFilters() {
    setQuery('');
    setFruit('all');
    setVariety('all');
    setCaliber('all');
    setPhysical('all');
  }
  return (
    <AppShell session={session} current="/inventario">
      <main id="app-main" className="main-content operations-page">
        <div className="page-heading">
          <div>
            <h1>Inventario</h1>
            <p>Existencias físicas, desde la caja cerrada hasta la fruta contada.</p>
          </div>
          <Button asChild>
            <Link href="/recepciones">
              <Plus data-icon="inline-start" />
              Registrar recepción
            </Link>
          </Button>
        </div>
        {inventory.error ? (
          <LoadError error={inventory.error} retry={() => void inventory.reload()} />
        ) : null}
        {inventory.loading && !inventory.data ? <LoadingRows /> : null}
        {inventory.data ? (
          <>
            <StockTotals stock={inventory.data.totals} />
            <p className="stock-equivalence">
              <strong>
                {inventory.data.totals.equivalentIntactBlisters} blíster equivalentes en empaques
                intactos
              </strong>
              <span>
                Es una equivalencia de cajas cerradas y blíster intactos, no stock adicional. Solo
                productos con blíster conocido. Excluye fruta ya fraccionada. Equivalencia comercial
                de cajas:{' '}
                {inventory.data.totals.equivalentBoxes.toLocaleString('es-VE', {
                  maximumFractionDigits: 4,
                })}
                ; incluye únicamente empaques con equivalencia explícita.
              </span>
            </p>
            <section className="operations-panel" aria-label="Inventario por lote">
              <div className="panel-heading">
                <Boxes aria-hidden="true" />
                <h2>Lotes en {inventory.data.warehouse.name}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Actualizar inventario"
                  disabled={inventory.loading}
                  onClick={() => void inventory.reload()}
                >
                  <RefreshCw />
                </Button>
              </div>
              <div className="inventory-filters">
                <div className="search-field">
                  <Search aria-hidden="true" />
                  <Input
                    aria-label="Buscar lotes"
                    value={query}
                    placeholder="Buscar lote, producto o proveedor…"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="inventory-filter-fields">
                  <Field>
                    <FieldLabel htmlFor="inventory-fruit">Fruta</FieldLabel>
                    <NativeSelect
                      id="inventory-fruit"
                      value={fruit}
                      onChange={(e) => {
                        setFruit(e.target.value);
                        setVariety('all');
                        setCaliber('all');
                      }}
                    >
                      <option value="all">Todas</option>
                      {fruits.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="inventory-variety">Variedad</FieldLabel>
                    <NativeSelect
                      id="inventory-variety"
                      value={variety}
                      onChange={(e) => setVariety(e.target.value)}
                    >
                      <option value="all">Todas</option>
                      {varieties.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="inventory-caliber">Calibre</FieldLabel>
                    <NativeSelect
                      id="inventory-caliber"
                      value={caliber}
                      onChange={(e) => setCaliber(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      {calibers.map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="inventory-state">Disponibilidad</FieldLabel>
                    <NativeSelect
                      id="inventory-state"
                      value={physical}
                      onChange={(e) => setPhysical(e.target.value)}
                    >
                      <option value="all">Todas</option>
                      <option value="closed">Con cajas cerradas</option>
                      <option value="open">Con cajas abiertas</option>
                      <option value="halves">Con medias cajas</option>
                      <option value="loose">Con fruta suelta</option>
                      <option value="empty">Sin existencias</option>
                    </NativeSelect>
                  </Field>
                </div>
              </div>
              {filtered.length === 0 ? (
                <div className="operation-empty">
                  <Boxes aria-hidden="true" />
                  <h2>
                    {all.length === 0
                      ? 'El inventario empieza con una recepción'
                      : 'No hay lotes con estos filtros'}
                  </h2>
                  <p>
                    {all.length === 0
                      ? 'Registra las cajas que realmente llegaron. Aquí verás sus lotes y movimientos.'
                      : 'Limpia los filtros para volver a ver todos los lotes.'}
                  </p>
                  {all.length === 0 ? (
                    <Button asChild>
                      <Link href="/recepciones">Registrar primera recepción</Link>
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={clearFilters}>
                      Limpiar filtros
                    </Button>
                  )}
                </div>
              ) : (
                <div className="inventory-table-wrap">
                  <table className="inventory-table">
                    <caption className="sr-only">Saldos físicos por lote, sin doble conteo</caption>
                    <thead>
                      <tr>
                        <th scope="col">Producto y lote</th>
                        <th scope="col">Cajas / unidades cerradas</th>
                        <th scope="col">Blíster intactos</th>
                        <th scope="col">Medias cajas</th>
                        <th scope="col">Piezas sueltas</th>
                        <th scope="col">
                          <span className="sr-only">Detalle</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((lot) => (
                        <tr key={lot.id} className={initialLotId === lot.id ? 'lot-selected' : ''}>
                          <td data-label="Producto">
                            <Link
                              className="lot-product"
                              href={`/inventario?lote=${lot.id}`}
                              scroll={false}
                            >
                              <strong>
                                {lot.fruit} {lot.variety}
                              </strong>
                              <span>
                                {lot.caliber ? `Calibre ${lot.caliber} · ` : ''}
                                {lot.commercialLine} · {lot.code}
                              </span>
                            </Link>
                            <span className="lot-supplier">
                              {lot.supplier ?? 'Sin proveedor indicado'}
                            </span>
                            {lot.isDemo ? <Badge variant="secondary">DEMO</Badge> : null}
                          </td>
                          <td data-label={lot.commercialUnitLabel ?? 'Cajas cerradas'}>
                            {lot.closedBoxes}
                            {lot.commercialUnitLabel ? (
                              <small>{lot.commercialUnitLabel}</small>
                            ) : null}
                          </td>
                          <td data-label="Blíster intactos">
                            {lot.packingModel === 'blister' ? lot.intactBlisters : 'No aplica'}
                          </td>
                          <td data-label="Medias cajas">
                            {lot.preparedHalfBoxes}
                            <small>
                              {lot.packingModel === 'halves'
                                ? 'Mitades comerciales'
                                : lot.packingModel === 'whole'
                                  ? 'No aplica'
                                  : `${lot.preparedPieces} piezas preparadas`}
                            </small>
                          </td>
                          <td data-label="Piezas sueltas">
                            {lot.packingModel === 'blister' ? lot.loosePieces : 'No aplica'}
                          </td>
                          <td>
                            <Button variant="ghost" size="icon" asChild>
                              <Link
                                aria-label={`Ver lote ${lot.code}`}
                                href={`/inventario?lote=${lot.id}`}
                                scroll={false}
                              >
                                <ChevronRight />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <footer className="table-footer">
                <span>
                  {filtered.length} de {all.length} lotes
                </span>
                <span>Las cajas abiertas no agregan unidades al saldo.</span>
              </footer>
            </section>
          </>
        ) : null}
        {initialLotId ? (
          <LotDetailPanel
            key={initialLotId}
            lotId={initialLotId}
            onChange={() => void inventory.reload()}
          />
        ) : null}
        <PageFooter />
      </main>
    </AppShell>
  );
}
function LotDetailPanel({ lotId, onChange }: { lotId: string; onChange: () => void }) {
  const detail = useRemote<LotDetail>(`/api/inventory/lots/${encodeURIComponent(lotId)}`);
  const [operation, setOperation] = useState<StockAction | null>(null),
    [success, setSuccess] = useState(''),
    [showEmpty, setShowEmpty] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null),
    focused = useRef(false);
  useEffect(() => {
    if (detail.data && !focused.current) {
      focused.current = true;
      heading.current?.focus();
    }
  }, [detail.data]);
  if (detail.error)
    return (
      <section className="lot-detail">
        <LoadError error={detail.error} retry={() => void detail.reload()} />
      </section>
    );
  if (!detail.data)
    return (
      <section className="lot-detail">
        <LoadingRows />
      </section>
    );
  const { lot, containers, movements } = detail.data;
  const available = containers.filter(
    (c) => c.quantity > 0 && c.state !== 'empty' && c.state !== 'dispatched',
  );
  const listed = showEmpty
    ? containers
    : containers.filter((c) => c.state !== 'empty' && c.state !== 'dispatched');
  const emptyCount = containers.filter(
    (c) => c.state === 'empty' || c.state === 'dispatched',
  ).length;
  const canFraction = available.some(
    (c) =>
      (c.state === 'sealed' && (c.kind === 'box' || c.kind === 'blister')) ||
      c.unit === 'loose_piece',
  );
  function open(action: StockAction) {
    setSuccess('');
    setOperation(action);
  }
  return (
    <section className="lot-detail" aria-labelledby="lot-detail-title">
      <div className="section-heading">
        <div>
          <h2 ref={heading} tabIndex={-1} id="lot-detail-title">
            Detalle del lote {lot.code}
          </h2>
          <p>
            {productLabel(lot)} {lot.isDemo ? <Badge variant="secondary">DEMO</Badge> : null}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/inventario" scroll={false}>
            Cerrar detalle
          </Link>
        </Button>
      </div>
      {success ? <SavedNotice>{success}</SavedNotice> : null}
      <div className="lot-metadata">
        <dl>
          <div>
            <dt>Proveedor</dt>
            <dd>{lot.supplier ?? 'Sin proveedor indicado'}</dd>
          </div>
          <div>
            <dt>Ingreso</dt>
            <dd>{displayDate(lot.receivedAt)}</dd>
          </div>
          <div>
            <dt>{lot.commercialUnitLabel ? 'Unidades recibidas' : 'Cajas recibidas'}</dt>
            <dd>{lot.receivedBoxes}</dd>
          </div>
          <div>
            <dt>Empaque histórico</dt>
            <dd>{packingLabel({ ...lot, boxWeightKg: lot.boxWeightKgSnapshot })}</dd>
          </div>
        </dl>
        {lot.notes ? <p>{lot.notes}</p> : null}
      </div>
      <StockTotals
        stock={lot}
        model={lot.packingModel}
        commercialUnitLabel={lot.commercialUnitLabel}
      />
      <p className="stock-equivalence">
        <strong>
          {lot.packingModel === 'blister'
            ? `${lot.equivalentIntactBlisters} blíster equivalentes en empaques intactos`
            : `${lot.equivalentBoxes.toLocaleString('es-VE', { maximumFractionDigits: 4 })} ${lot.commercialUnitLabel ?? 'cajas equivalentes comerciales'}`}
        </strong>
        <span>
          {lot.packingModel === 'blister'
            ? 'La cantidad de frutas dentro de empaques cerrados permanece desconocida hasta contarlas.'
            : 'Las medias cajas no se cuentan como cajas cerradas. No se generan cantidades de fruta.'}
        </span>
      </p>
      <div className="inventory-actions">
        {lot.packingModel === 'halves' ? (
          <Button
            variant="outline"
            disabled={detail.loading || lot.closedBoxes === 0}
            onClick={() => open({ kind: 'split-halves' })}
          >
            <Scissors aria-hidden="true" />
            Dividir en medias cajas
          </Button>
        ) : null}
        {lot.packingModel === 'blister' && lot.blistersPerBox !== null ? (
          <Button
            disabled={
              detail.loading ||
              lot.intactBlisters + lot.closedBoxes * (lot.blistersPerBox ?? 0) === 0
            }
            onClick={() => open({ kind: 'withdraw-blisters' })}
          >
            <ArrowUpRight data-icon="inline-start" />
            Retirar blíster
          </Button>
        ) : null}
        {lot.packingModel === 'blister' &&
        lot.halfPreparation === 'counted' &&
        lot.allowedPresentations.includes('half_box') ? (
          <Button
            variant="outline"
            disabled={detail.loading || !canFraction}
            onClick={() => open({ kind: 'prepare-half' })}
          >
            <Scissors data-icon="inline-start" />
            Preparar media caja
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={detail.loading || available.length === 0}
          onClick={() => open({ kind: 'adjust' })}
        >
          <Settings2 data-icon="inline-start" />
          Ajustar inventario
        </Button>
      </div>
      <Alert>
        <Info aria-hidden="true" />
        <AlertDescription>
          Los retiros de esta pantalla son movimientos internos. Para entregar mercancía a un
          cliente, registra una venta.
        </AlertDescription>
      </Alert>
      <section className="operations-panel" aria-label="Contenedores del lote">
        <div className="panel-heading">
          <Box aria-hidden="true" />
          <h3>Contenido físico del lote</h3>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={(e) => setShowEmpty(e.target.checked)}
            />
            Ver vacíos y retirados ({emptyCount})
          </label>
        </div>
        {listed.length === 0 ? (
          <div className="operation-empty">
            <p>
              Este lote no tiene contenedores disponibles. Los vacíos y retirados se conservan en el
              historial.
            </p>
          </div>
        ) : (
          <div className="container-list">
            {listed.map((container) => {
              const parent = containers.find((c) => c.id === container.parentId);
              const sealed = container.state === 'sealed' && container.quantity > 0;
              return (
                <article className="container-row" key={container.id}>
                  <div className="container-identity">
                    <Box aria-hidden="true" />
                    <div>
                      <h4>{containerName(container, lot.commercialUnitLabel)}</h4>
                      <p>
                        {parent
                          ? `Dentro de ${containerName(parent, lot.commercialUnitLabel)}`
                          : 'Contenedor del lote'}
                      </p>
                    </div>
                  </div>
                  <div className="container-status">
                    <Badge variant="secondary">{stateNames[container.state]}</Badge>
                    <span>
                      {container.unit === 'box_fraction'
                        ? `${(container.quantity / (2 * (lot.blistersPerBox ?? 1))).toLocaleString('es-VE', { maximumFractionDigits: 3 })} caja restante`
                        : container.unit === 'loose_piece'
                          ? `${container.quantity} piezas sueltas`
                          : container.unit === 'prepared_half_box'
                            ? `${container.quantity} media caja${container.countedPieces === null ? ' comercial' : ` · ${container.countedPieces} piezas`}`
                            : container.state === 'open'
                              ? 'Contenedor; el saldo está en su contenido'
                              : `${container.quantity} ${container.unit === 'sealed_box' ? (lot.commercialUnitLabel ?? 'caja cerrada') : 'blíster intacto'}`}
                    </span>
                    <small>
                      {container.unit === 'box_fraction'
                        ? 'Se descuenta automáticamente al vender'
                        : lot.packingModel !== 'blister'
                          ? 'Sin conteo de piezas'
                          : container.countedPieces === null
                            ? 'Frutas: cantidad desconocida'
                            : `${container.countedPieces} frutas contadas`}
                    </small>
                  </div>
                  <div className="container-actions">
                    {sealed && container.kind === 'box' && lot.packingModel === 'halves' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={detail.loading}
                        onClick={() => open({ kind: 'split-halves', containerId: container.id })}
                      >
                        Dividir en medias cajas
                      </Button>
                    ) : null}
                    {sealed &&
                    container.kind === 'box' &&
                    lot.packingModel === 'blister' &&
                    lot.blistersPerBox !== null ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={detail.loading}
                        onClick={() => open({ kind: 'open-box', containerId: container.id })}
                      >
                        <PackageOpen data-icon="inline-start" />
                        Abrir caja
                      </Button>
                    ) : null}
                    {sealed && container.kind === 'blister' && lot.packingModel === 'blister' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={detail.loading}
                        onClick={() => open({ kind: 'open-blister', containerId: container.id })}
                      >
                        <PackageOpen data-icon="inline-start" />
                        Abrir blíster
                      </Button>
                    ) : null}
                    {lot.packingModel === 'blister' &&
                    lot.halfPreparation === 'counted' &&
                    lot.allowedPresentations.includes('half_box') &&
                    container.quantity > 0 &&
                    ((sealed && (container.kind === 'box' || container.kind === 'blister')) ||
                      container.unit === 'loose_piece') ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={detail.loading}
                        onClick={() => open({ kind: 'prepare-half', containerId: container.id })}
                      >
                        Preparar mitad
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
      <section className="operations-panel movement-panel" aria-label="Historial de movimientos">
        <div className="panel-heading">
          <History aria-hidden="true" />
          <h3>Historial de movimientos</h3>
          <span>{movements.length} registros</span>
        </div>
        {movements.length === 0 ? (
          <div className="operation-empty">
            <p>No hay movimientos registrados.</p>
          </div>
        ) : (
          <ol className="movement-list">
            {movements.map((movement, index) => (
              <li key={movement.id}>
                <div className="movement-main">
                  <div>
                    <h4>
                      {movementNames[movement.kind]}
                      {movement.reversedBy ? <Badge variant="secondary">Revertido</Badge> : null}
                    </h4>
                    <time dateTime={movement.createdAt}>{displayDate(movement.createdAt)}</time>
                    <p>{movement.reason}</p>
                    <small>
                      Movimiento {movement.id.slice(0, 8)} · Usuario {movement.actor}
                    </small>
                    {movement.countedBefore !== null ? (
                      <p className="movement-count">
                        {movement.countedBefore} piezas contadas
                        {movement.preparedPieces !== null
                          ? ` = ${movement.preparedPieces} preparadas + ${movement.remainingPieces} restantes`
                          : ''}
                      </p>
                    ) : null}
                  </div>
                  {index === 0 && !movement.reversedBy && movement.kind !== 'reversal' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={detail.loading}
                      onClick={() => open({ kind: 'reverse', movement })}
                    >
                      <Undo2 data-icon="inline-start" />
                      Revertir
                    </Button>
                  ) : null}
                </div>
                <details>
                  <summary>Ver entradas del movimiento</summary>
                  <ul className="movement-entries">
                    {movement.entries.map((entry) => (
                      <li key={entry.id}>
                        <span>{entry.containerId.slice(0, 8)}</span>
                        <span>
                          {entry.quantityDelta > 0 ? '+' : ''}
                          {entry.unit === 'box_fraction'
                            ? (
                                entry.quantityDelta /
                                (2 * (lot.blistersPerBox ?? 1))
                              ).toLocaleString('es-VE', { maximumFractionDigits: 3 })
                            : entry.quantityDelta}{' '}
                          {
                            (
                              {
                                sealed_box: lot.commercialUnitLabel ?? 'cajas',
                                intact_blister: 'blíster',
                                prepared_half_box: 'medias cajas',
                                loose_piece: 'piezas',
                                box_fraction: 'cajas',
                              } as const
                            )[entry.unit]
                          }
                        </span>
                        <span>
                          {entry.piecesDelta === null
                            ? 'Conteo de frutas desconocido'
                            : `${entry.piecesDelta > 0 ? '+' : ''}${entry.piecesDelta} frutas`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
      {operation ? (
        <InventoryOperationDialog
          action={operation}
          detail={detail.data}
          onClose={() => setOperation(null)}
          onSaved={async (result) => {
            setOperation(null);
            setSuccess(
              result.usedContainers?.length
                ? `Retiro guardado. Contenedores utilizados: ${result.usedContainers.map((c) => `${c.id.slice(0, 8)} (${c.quantity} blíster)`).join(', ')}.`
                : 'Movimiento guardado y saldos actualizados.',
            );
            await detail.reload();
            onChange();
          }}
        />
      ) : null}
    </section>
  );
}
