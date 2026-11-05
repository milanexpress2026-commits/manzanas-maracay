'use client';
import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import {
  Apple,
  Package,
  Layers3,
  Ruler,
  Plus,
  Search,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  Check,
  RefreshCw,
  Leaf,
  Settings2,
  Box,
  Info,
  CheckCircle2,
  WifiOff,
  Pencil,
  BookOpen,
} from 'lucide-react';
import type { Catalog, Configuration } from '@mm/domain';
import type { CatalogFamily } from '@/lib/product-draft';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from '@/components/ui/dialog';
import { fetchCatalog } from '@/lib/catalog-api';
import { CatalogForm, type FormKind } from './catalog-form';
import { CatalogPreparation } from './catalog-preparation';
import { CatalogTemplates } from './catalog-templates';
import preparationStyles from './catalog-preparation.module.css';
import { AppShell, type AppSession } from './app-shell';
import { CatalogPrices } from './catalog-prices';
import { packingLabel, productLabel, presentationNames } from '@/lib/commercial-ui';
import { useCommand } from '@/lib/inventory-api';
import { FormError, SaveButton } from './operations-ui';
import { Field, FieldLabel } from './ui/field';
import { ProductForm } from './product-form';
import productStyles from './product-form.module.css';
const empty: Catalog = { fruits: [], varieties: [], calibers: [], configurations: [] };
const tabLabels = {
  configurations: 'Empaques',
  fruits: 'Frutas',
  varieties: 'Variedades',
  calibers: 'Calibres',
};
const singular = {
  configurations: 'configuración',
  fruits: 'fruta',
  varieties: 'variedad',
  calibers: 'calibre',
};
type Tab = keyof typeof tabLabels;

export function CatalogScreen({ session }: { session: AppSession }) {
  const [catalog, setCatalog] = useState<Catalog>(empty),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const [tab, setTab] = useState<Tab>('configurations'),
    [search, setSearch] = useState(''),
    [fruitFilter, setFruitFilter] = useState('all'),
    [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<{ kind: FormKind; editing?: Configuration } | null>(null),
    [guide, setGuide] = useState(false),
    [offline, setOffline] = useState(false);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [returnToSale, setReturnToSale] = useState(false);
  const [priceTarget, setPriceTarget] = useState('');
  const triggerRef = useRef<HTMLElement | null>(null);
  const caliberMemory = useRef<Partial<Record<CatalogFamily, string[]>>>({});
  const [preparing, setPreparing] = useState(false);
  async function reload() {
    setLoading(true);
    setError('');
    try {
      setCatalog(await fetchCatalog());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnToSale(params.get('returnTo') === '/ventas/nueva');
    const product = params.get('producto');
    if (product) {
      setSelectedId(product);
      if (params.get('precios') === '1') setPriceTarget(product);
    }
    void reload();
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  function openForm(kind: FormKind, editing?: Configuration) {
    triggerRef.current = document.activeElement as HTMLElement;
    setSuccess('');
    setFormBusy(false);
    setForm({ kind, editing });
  }
  function changeTab(value: string) {
    setTab(value as Tab);
    setSearch('');
    setFruitFilter('all');
  }
  function closeForm() {
    setForm(null);
    // Contextual fruit/variety/caliber entries are already saved even if the product is cancelled.
    void reload().then(() => requestAnimationFrame(() => triggerRef.current?.focus()));
  }
  const query = search.trim().toLocaleLowerCase('es');
  const match = (value: string) => value.toLocaleLowerCase('es').includes(query);
  const configurations = catalog.configurations.filter(
    (c) =>
      (fruitFilter === 'all' || c.fruitId === fruitFilter) &&
      match(`${c.fruit} ${c.variety ?? ''} ${c.caliber ?? ''} ${c.commercialLine}`),
  );
  const selected = configurations.find((c) => c.id === selectedId) ?? configurations[0];
  const fruitName = (id: string) => catalog.fruits.find((f) => f.id === id)?.name ?? 'Sin fruta';
  const masterRows =
    tab === 'fruits'
      ? catalog.fruits
          .filter((f) => match(f.name))
          .map((f) => ({
            id: f.id,
            name: f.name,
            secondary: `${catalog.varieties.filter((v) => v.fruitId === f.id).length} variedades`,
            detail: `${catalog.calibers.filter((c) => c.fruitId === f.id).length} calibres`,
            fruitId: f.id,
          }))
      : tab === 'varieties'
        ? catalog.varieties
            .filter(
              (v) =>
                (fruitFilter === 'all' || v.fruitId === fruitFilter) &&
                match(`${v.name} ${fruitName(v.fruitId)}`),
            )
            .map((v) => ({
              id: v.id,
              name: v.name,
              secondary: fruitName(v.fruitId),
              detail: `${catalog.configurations.filter((c) => c.varietyId === v.id).length} empaques`,
              fruitId: v.fruitId,
            }))
        : catalog.calibers
            .filter(
              (c) =>
                (fruitFilter === 'all' || c.fruitId === fruitFilter) &&
                match(`${c.label} ${fruitName(c.fruitId)}`),
            )
            .map((c) => ({
              id: c.id,
              name: `Calibre ${c.label}`,
              secondary: fruitName(c.fruitId),
              detail: 'Clasificación de tamaño',
              fruitId: c.fruitId,
            }));
  const count = tab === 'configurations' ? configurations.length : masterRows.length;
  return (
    <AppShell session={session} current="/catalogo" onGuide={() => setGuide(true)}>
      <main id="app-main" className="main-content">
        <div className="page-heading">
          <div>
            <h1>Catálogo de productos</h1>
            <p>Organiza tus frutas, variedades y presentaciones.</p>
          </div>
          <Button
            className="primary-action"
            onClick={() => openForm('configurations')}
            disabled={loading || !!error || offline}
          >
            <Plus data-icon="inline-start" /> Agregar producto
          </Button>
        </div>
        {returnToSale ? (
          <p className="commercial-help">
            <Link href="/ventas/nueva">Volver a la venta guardada</Link>
          </p>
        ) : null}
        <div className="catalog-summary" aria-label="Resumen del catálogo">
          <span>
            <Apple aria-hidden="true" />
            <strong>{loading || error ? '—' : catalog.fruits.length}</strong> frutas
          </span>
          <span>
            <Leaf aria-hidden="true" />
            <strong>{loading || error ? '—' : catalog.varieties.length}</strong> variedades
          </span>
          <span>
            <Ruler aria-hidden="true" />
            <strong>{loading || error ? '—' : catalog.calibers.length}</strong> calibres
          </span>
          <span className="summary-description">Todo empieza con un buen catálogo.</span>
        </div>
        {offline ? (
          <Alert variant="destructive">
            <WifiOff />
            <AlertTitle>Sin conexión</AlertTitle>
            <AlertDescription>
              Los cambios no se guardarán hasta recuperar la conexión.
            </AlertDescription>
          </Alert>
        ) : null}
        {success ? (
          <div role="status" className="success-message">
            <CheckCircle2 aria-hidden="true" />
            {success}
          </div>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <Info />
            <AlertTitle>No se pudo actualizar el catálogo</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={() => void reload()}>
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {preparing ? (
          <CatalogPreparation onDone={reload} onCancel={() => setPreparing(false)} />
        ) : !loading && !error ? (
          <section className={preparationStyles.entry} aria-label="Preparar productos habituales">
            <h2>
              {catalog.fruits.length
                ? 'Productos habituales, listos para revisar'
                : 'Empieza con el catálogo del negocio'}
            </h2>
            <p>
              Revisa las frutas y opciones ya comunicadas, desmarca lo que no vendas y prepara los
              borradores. Las cajas, costos y precios se registran después.
            </p>
            <Button
              variant={catalog.fruits.length ? 'outline' : 'default'}
              disabled={offline}
              onClick={() => setPreparing(true)}
            >
              Preparar catálogo de Manzanas Maracay
            </Button>
          </section>
        ) : null}
        {!preparing && catalog.fruits.length > 0 ? (
          <CatalogTemplates
            catalog={catalog}
            onReload={reload}
            returnToSale={returnToSale}
            onSaved={async (id) => {
              setSelectedId(id);
              setTab('configurations');
              setSearch('');
              setFruitFilter('all');
              await reload();
            }}
          />
        ) : null}
        <div className="workspace-grid">
          <section className="catalog-panel" aria-label="Registros del catálogo">
            <Tabs value={tab} onValueChange={changeTab}>
              <TabsList className="catalog-tabs" aria-label="Secciones del catálogo">
                {Object.entries(tabLabels).map(([value, label]) => (
                  <TabsTrigger key={value} value={value}>
                    {label}
                    <span className="tab-count">
                      {loading || error ? '—' : catalog[value as Tab].length}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value={tab} className="catalog-tab-content">
                <div className="catalog-toolbar">
                  <div className="search-field">
                    <Search aria-hidden="true" />
                    <Input
                      aria-label="Buscar en el catálogo"
                      placeholder={
                        tab === 'configurations'
                          ? 'Buscar fruta, variedad o calibre…'
                          : `Buscar ${tabLabels[tab].toLowerCase()}…`
                      }
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  {tab !== 'fruits' ? (
                    <select
                      className="fruit-filter"
                      aria-label="Filtrar por fruta"
                      value={fruitFilter}
                      onChange={(e) => setFruitFilter(e.target.value)}
                    >
                      <option value="all">Todas las frutas</option>
                      {catalog.fruits.map((f) => (
                        <option value={f.id} key={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Actualizar catálogo"
                    onClick={() => void reload()}
                    disabled={loading}
                  >
                    <RefreshCw className={loading ? 'spin' : ''} />
                  </Button>
                </div>
                {tab !== 'configurations' && count > 0 ? (
                  <div className="inline-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openForm(tab)}
                      disabled={loading || !!error || offline}
                    >
                      <Plus aria-hidden="true" />
                      Crear {singular[tab]}
                    </Button>
                  </div>
                ) : null}
                {loading ? (
                  <div className="loading-list" role="status" aria-label="Cargando catálogo">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="loading-row" />
                    ))}
                  </div>
                ) : error ? (
                  <p className="commercial-help">
                    Vuelve a consultar el catálogo para ver los registros disponibles.
                  </p>
                ) : count === 0 ? (
                  <div className="empty-state">
                    <Package aria-hidden="true" />
                    <h2>
                      {search || fruitFilter !== 'all'
                        ? 'No encontramos coincidencias'
                        : `Todavía no hay ${tabLabels[tab].toLowerCase()}`}
                    </h2>
                    <p>
                      {search || fruitFilter !== 'all'
                        ? 'Prueba otro nombre o quita el filtro.'
                        : !catalog.fruits.length
                          ? 'Pulsa Agregar producto: podrás crear fruta, variedad y calibre aquí mismo, y después definir su empaque.'
                          : tab === 'configurations'
                            ? 'Pulsa Agregar producto para definir lo que vas a recibir y vender.'
                            : `Agrega tu primer registro para organizar el catálogo.`}
                    </p>
                    {search || fruitFilter !== 'all' ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearch('');
                          setFruitFilter('all');
                        }}
                      >
                        Limpiar filtros
                      </Button>
                    ) : tab !== 'configurations' ? (
                      <Button
                        variant="outline"
                        onClick={() => openForm(tab)}
                        disabled={!!error || offline}
                      >
                        <Plus />
                        Crear {singular[tab]}
                      </Button>
                    ) : null}
                  </div>
                ) : tab === 'configurations' ? (
                  <div className="table-scroll">
                    <table className="catalog-table">
                      <caption className="sr-only">
                        Configuraciones de empaque por fruta, variedad y calibre
                      </caption>
                      <thead>
                        <tr>
                          <th>Producto / variedad</th>
                          <th>Calibre</th>
                          <th>Empaque habitual</th>
                          <th>
                            <span className="sr-only">Detalle</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {configurations.map((c) => (
                          <tr key={c.id} className={selected?.id === c.id ? 'selected-row' : ''}>
                            <td>
                              <button
                                className="product-link"
                                onClick={() => setSelectedId(c.id)}
                                aria-label={
                                  'Ver ' +
                                  c.fruit +
                                  (c.variety ? ' ' + c.variety : '') +
                                  (c.caliber ? ' calibre ' + c.caliber : '') +
                                  (c.commercialLine !== 'Estándar' ? ' · ' + c.commercialLine : '')
                                }
                                aria-pressed={selected?.id === c.id}
                              >
                                <span className="product-icon">
                                  <Apple aria-hidden="true" />
                                </span>
                                <span>
                                  <strong>{c.variety ?? c.fruit}</strong>
                                  <small>
                                    {c.variety ? c.fruit + ' · ' : ''}
                                    {c.commercialLine}
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className="caliber-label">{c.caliber ?? 'No aplica'}</span>
                            </td>
                            <td>
                              <span className="pack-label">
                                <Package aria-hidden="true" />
                                {packingLabel(c)}
                              </span>
                            </td>
                            <td>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Editar ${c.variety ?? c.fruit}${c.caliber ? ' calibre ' + c.caliber : ''}`}
                                onClick={() => openForm('configurations', c)}
                                disabled={offline || !!error}
                              >
                                <Pencil />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="master-list">
                    {masterRows.map((row) => (
                      <div key={row.id} className="master-row">
                        <div className="product-icon">
                          {tab === 'fruits' ? (
                            <Apple aria-hidden="true" />
                          ) : tab === 'varieties' ? (
                            <Leaf aria-hidden="true" />
                          ) : (
                            <Ruler aria-hidden="true" />
                          )}
                        </div>
                        <div>
                          <strong>{row.name}</strong>
                          <small>{row.secondary}</small>
                        </div>
                        <span>{row.detail}</span>
                        {tab === 'varieties' ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Renombrar ${row.name}`}
                            onClick={() => setRename({ id: row.id, name: row.name })}
                          >
                            <Pencil />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ver empaques de ${row.name}`}
                          onClick={() => {
                            setTab('configurations');
                            setSearch(tab === 'fruits' ? '' : row.name.replace('Calibre ', ''));
                            setFruitFilter(row.fruitId);
                          }}
                        >
                          <ArrowUpRight />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <footer className="table-footer">
                  <span>
                    {count} {count === 1 ? 'registro' : 'registros'}
                    {search || fruitFilter !== 'all' ? ' encontrados' : ' en el catálogo'}
                  </span>
                  <span>
                    <span className={`status-dot ${error ? 'disconnected' : ''}`} />
                    {loading
                      ? 'Actualizando…'
                      : error
                        ? 'Sin conexión al servidor'
                        : 'Catálogo actualizado'}
                  </span>
                </footer>
              </TabsContent>
            </Tabs>
          </section>
          <aside className="detail-panel" aria-label="Detalle del empaque">
            <div className="detail-heading">
              <Package aria-hidden="true" />
              <h2>Detalle del empaque</h2>
            </div>
            {selected ? (
              <>
                <div className="detail-product">
                  <span className="detail-fruit">{selected.fruit}</span>
                  <h3>{selected.variety ?? selected.fruit}</h3>
                  <span className="detail-caliber">
                    {selected.caliber ? `Calibre ${selected.caliber} · ` : ''}
                    {selected.commercialLine}
                  </span>
                </div>
                <div
                  className="packing-visual"
                  aria-label={
                    selected.packingModel === 'blister' && selected.blistersPerBox !== null
                      ? selected.blistersPerBox + ' blíster en una caja'
                      : packingLabel(selected)
                  }
                >
                  <div className="packing-visual-label">
                    <Box aria-hidden="true" />
                    <span>{packingLabel(selected)}</span>
                  </div>
                  {selected.packingModel === 'blister' && selected.blistersPerBox != null ? (
                    <div className="blister-grid">
                      {Array.from({ length: Math.min(selected.blistersPerBox, 12) }, (_, i) => (
                        <div className="blister-unit" key={i}>
                          <Layers3 aria-hidden="true" />
                          <span>Blíster {i + 1}</span>
                        </div>
                      ))}
                      {selected.blistersPerBox > 12 ? (
                        <p>+ {selected.blistersPerBox - 12} blíster</p>
                      ) : null}
                    </div>
                  ) : (
                    <p>
                      {selected.packingModel === 'halves'
                        ? 'Dos mitades comerciales, sin conteo de piezas.'
                        : selected.packingModel === 'whole'
                          ? 'Se vende únicamente la caja completa.'
                          : 'Contenido pendiente de confirmar.'}
                    </p>
                  )}
                </div>
                <dl className="packing-facts">
                  <div>
                    <dt>Venta permitida</dt>
                    <dd>
                      {selected.allowedPresentations.map((p) => presentationNames[p]).join(', ')}
                    </dd>
                  </div>
                  <div>
                    <dt>Configuración</dt>
                    <dd>
                      <Badge variant="secondary">
                        {selected.confirmationStatus === 'confirmed'
                          ? 'Confirmada'
                          : 'Pendiente de confirmar'}
                      </Badge>
                    </dd>
                  </div>
                  {selected.packingModel === 'blister' ? (
                    <div>
                      <dt>Media caja</dt>
                      <dd>
                        {selected.halfPreparation === 'counted'
                          ? 'Con conteo físico'
                          : selected.halfPreparation === 'pending'
                            ? 'Por confirmar'
                            : 'No aplica'}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <Button
                  variant="outline"
                  className="edit-packing"
                  onClick={() => openForm('configurations', selected)}
                  disabled={loading || !!error || offline}
                >
                  <Settings2 data-icon="inline-start" />
                  Editar empaque
                </Button>
                {selected.notes ? <p className="packing-notes">{selected.notes}</p> : null}
                <CatalogPrices
                  key={selected.id + ':' + selected.version}
                  configuration={selected}
                  initialOpen={selected.id === priceTarget}
                  onSaved={reload}
                />
              </>
            ) : (
              <div className="detail-empty">
                <Box />
                <p>El detalle aparecerá cuando agregues un producto.</p>
              </div>
            )}
          </aside>
        </div>
        <section className="catalog-help" aria-label="Reglas del catálogo">
          <div className="help-icon">
            <BookOpen aria-hidden="true" />
          </div>
          <div>
            <h2>Un empaque claro. Un inventario confiable.</h2>
            <p>
              El calibre clasifica el tamaño; no indica cuántas frutas hay. Cada lote puede tener un
              empaque diferente.
            </p>
            <button onClick={() => setGuide(true)}>
              Cómo se organiza el catálogo <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <div className="hierarchy-preview" aria-hidden="true">
            <span>Fruta</span>
            <ChevronRight />
            <span>Variedad</span>
            <ChevronRight />
            <span>Calibre</span>
            <ChevronRight />
            <strong>Empaque</strong>
          </div>
        </section>
        <footer className="page-footer">
          <span>Manzanas Maracay · Frutas importadas</span>
          <span>Gestión del catálogo</span>
        </footer>
      </main>
      <Dialog
        open={!!form}
        onOpenChange={(open) => {
          if (!open && !formBusy) closeForm();
        }}
      >
        <DialogContent
          className={`catalog-dialog ${form?.kind === 'configurations' && !form.editing ? productStyles.dialog : ''}`}
          showCloseButton={!formBusy}
          onInteractOutside={(event) => {
            if (form?.kind === 'configurations' && !form.editing) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (formBusy) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {form?.editing
                ? 'Editar empaque'
                : form?.kind === 'configurations'
                  ? 'Agregar producto'
                  : form?.kind === 'calibers'
                    ? 'Nuevo calibre'
                    : `Nueva ${form ? singular[form.kind] : 'configuración'}`}
            </DialogTitle>
            <DialogDescription>
              {form?.kind === 'configurations'
                ? form.editing
                  ? 'Los cambios se aplican a próximas recepciones.'
                  : 'Crea o elige el producto, define su empaque y revisa antes de guardar.'
                : 'Agrega un registro al catálogo de frutas importadas.'}
            </DialogDescription>
          </DialogHeader>
          {form?.kind === 'configurations' && !form.editing ? (
            <ProductForm
              catalog={catalog}
              onCancel={closeForm}
              onBusyChange={setFormBusy}
              returnToSale={returnToSale}
              caliberMemory={caliberMemory}
              onSaved={async (id) => {
                setSelectedId(id);
                setTab('configurations');
                setSearch('');
                setFruitFilter('all');
                await reload();
              }}
            />
          ) : form ? (
            <CatalogForm
              key={`${form.kind}-${form.editing?.id ?? 'new'}`}
              kind={form.kind}
              editing={form.editing}
              catalog={catalog}
              onCancel={() => setForm(null)}
              onSaved={async () => {
                setForm(null);
                setSuccess('Cambios guardados correctamente.');
                await reload();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!rename}
        onOpenChange={(open) => {
          if (!open) setRename(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar variedad</DialogTitle>
            <DialogDescription>
              El nombre comercial se conserva en documentos ya confirmados.
            </DialogDescription>
          </DialogHeader>
          {rename ? (
            <RenameVariety
              variety={rename}
              onSaved={async () => {
                setRename(null);
                await reload();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={guide} onOpenChange={setGuide}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Del producto al empaque</DialogTitle>
            <DialogDescription>Configura el catálogo en este orden.</DialogDescription>
          </DialogHeader>
          <ol className="guide-list">
            <li>
              <strong>Fruta</strong>
              <p>El tipo de producto: manzana, pera o cualquier otra fruta importada.</p>
            </li>
            <li>
              <strong>Variedad</strong>
              <p>La variedad comercial, si aplica. Conserva el nombre confirmado por el negocio.</p>
            </li>
            <li>
              <strong>Calibre</strong>
              <p>La clasificación comercial del tamaño. No representa una cantidad de frutas.</p>
            </li>
            <li>
              <strong>Empaque</strong>
              <p>
                Define la línea comercial, el empaque y las presentaciones de venta. Variedad y
                calibre son opcionales.
              </p>
            </li>
          </ol>
          <Alert>
            <Info />
            <AlertDescription>
              Los productos con blíster pueden requerir conteo al fraccionar. Granel y kiwi usan
              mitades comerciales; uva se vende solo por caja.
            </AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function RenameVariety({
  variety,
  onSaved,
}: {
  variety: { id: string; name: string };
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(variety.name);
  const command = useCommand();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await command.run(
            `/api/catalog/varieties/${variety.id}`,
            { name, expectedName: variety.name },
            'PATCH',
          );
          await onSaved();
        } catch {}
      }}
    >
      <Field>
        <FieldLabel htmlFor="rename-variety">Nombre comercial</FieldLabel>
        <Input
          id="rename-variety"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <FormError message={command.error} />
      <div className="form-actions">
        <SaveButton busy={command.busy}>Guardar nombre</SaveButton>
      </div>
    </form>
  );
}
