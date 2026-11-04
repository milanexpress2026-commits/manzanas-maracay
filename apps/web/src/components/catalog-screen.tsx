'use client';
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
import { AppShell, type AppSession } from './app-shell';
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
  const triggerRef = useRef<HTMLElement | null>(null);
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
    setForm({ kind, editing });
  }
  function changeTab(value: string) {
    setTab(value as Tab);
    setSearch('');
    setFruitFilter('all');
  }
  const query = search.trim().toLocaleLowerCase('es');
  const match = (value: string) => value.toLocaleLowerCase('es').includes(query);
  const configurations = catalog.configurations.filter(
    (c) =>
      (fruitFilter === 'all' || c.fruitId === fruitFilter) &&
      match(`${c.fruit} ${c.variety} ${c.caliber}`),
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
    <AppShell session={session} current="/" onGuide={() => setGuide(true)}>
      <main id="app-main" className="main-content">
        <div className="page-heading">
          <div>
            <h1>Catálogo de productos</h1>
            <p>Organiza tus frutas, variedades y presentaciones.</p>
          </div>
          <Button
            className="primary-action"
            onClick={() => openForm(tab)}
            disabled={loading || !!error || offline}
          >
            <Plus data-icon="inline-start" />{' '}
            {tab === 'calibers' ? 'Nuevo calibre' : `Nueva ${singular[tab]}`}
          </Button>
        </div>
        <div className="catalog-summary" aria-label="Resumen del catálogo">
          <span>
            <Apple aria-hidden="true" />
            <strong>{catalog.fruits.length}</strong> frutas
          </span>
          <span>
            <Leaf aria-hidden="true" />
            <strong>{catalog.varieties.length}</strong> variedades
          </span>
          <span>
            <Ruler aria-hidden="true" />
            <strong>{catalog.calibers.length}</strong> calibres
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
        <div className="workspace-grid">
          <section className="catalog-panel" aria-label="Registros del catálogo">
            <Tabs value={tab} onValueChange={changeTab}>
              <TabsList className="catalog-tabs" aria-label="Secciones del catálogo">
                {Object.entries(tabLabels).map(([value, label]) => (
                  <TabsTrigger key={value} value={value}>
                    {label}
                    <span className="tab-count">{catalog[value as Tab].length}</span>
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
                {loading ? (
                  <div className="loading-list" role="status" aria-label="Cargando catálogo">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="loading-row" />
                    ))}
                  </div>
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
                        : tab === 'configurations'
                          ? 'Crea una configuración para definir los blíster de cada caja.'
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
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => openForm(tab)}
                        disabled={!!error || offline}
                      >
                        <Plus />
                        Agregar {singular[tab]}
                      </Button>
                    )}
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
                                aria-label={`Ver ${c.fruit} ${c.variety} calibre ${c.caliber}`}
                                aria-pressed={selected?.id === c.id}
                              >
                                <span className="product-icon">
                                  <Apple aria-hidden="true" />
                                </span>
                                <span>
                                  <strong>{c.variety}</strong>
                                  <small>{c.fruit}</small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className="caliber-label">{c.caliber}</span>
                            </td>
                            <td>
                              <span className="pack-label">
                                <Package aria-hidden="true" />
                                <strong>{c.blistersPerBox}</strong> blíster / caja
                              </span>
                            </td>
                            <td>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Editar ${c.variety} calibre ${c.caliber}`}
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
                        : 'Guardado en PostgreSQL'}
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
                  <h3>{selected.variety}</h3>
                  <span className="detail-caliber">Calibre {selected.caliber}</span>
                </div>
                <div
                  className="packing-visual"
                  aria-label={`${selected.blistersPerBox} blíster en una caja`}
                >
                  <div className="packing-visual-label">
                    <Box aria-hidden="true" />
                    <span>1 caja cerrada</span>
                  </div>
                  <div className="blister-grid">
                    {Array.from({ length: Math.min(selected.blistersPerBox, 12) }, (_, i) => (
                      <div className="blister-unit" key={i}>
                        <Layers3 aria-hidden="true" />
                        <span>Blíster {i + 1}</span>
                      </div>
                    ))}
                  </div>
                  {selected.blistersPerBox > 12 ? (
                    <p>+ {selected.blistersPerBox - 12} blíster</p>
                  ) : null}
                </div>
                <dl className="packing-facts">
                  <div>
                    <dt>Blíster por caja</dt>
                    <dd>{selected.blistersPerBox}</dd>
                  </div>
                  <div>
                    <dt>Cantidad de frutas</dt>
                    <dd>Por conteo físico</dd>
                  </div>
                  <div>
                    <dt>Configuración</dt>
                    <dd>
                      <Badge variant="secondary">Editable por lote</Badge>
                    </dd>
                  </div>
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
              </>
            ) : (
              <div className="detail-empty">
                <Box />
                <p>El detalle aparecerá cuando agregues una configuración.</p>
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
          <span>Fase 2 · Catálogo</span>
        </footer>
      </main>
      <Dialog
        open={!!form}
        onOpenChange={(open) => {
          if (!open) setForm(null);
        }}
      >
        <DialogContent
          className="catalog-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {form?.editing
                ? 'Editar empaque'
                : form?.kind === 'calibers'
                  ? 'Nuevo calibre'
                  : `Nueva ${form ? singular[form.kind] : 'configuración'}`}
            </DialogTitle>
            <DialogDescription>
              {form?.kind === 'configurations'
                ? 'Define la presentación habitual. Podrás ajustarla en cada lote.'
                : 'Agrega un registro al catálogo de frutas importadas.'}
            </DialogDescription>
          </DialogHeader>
          {form ? (
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
              <p>La variedad dentro de esa fruta, por ejemplo Gala o Pink Lady.</p>
            </li>
            <li>
              <strong>Calibre</strong>
              <p>La clasificación comercial del tamaño. No representa una cantidad de frutas.</p>
            </li>
            <li>
              <strong>Empaque</strong>
              <p>Combina fruta, variedad y calibre, e indica cuántos blíster contiene la caja.</p>
            </li>
          </ol>
          <Alert>
            <Info />
            <AlertDescription>
              Las cantidades de fruta se cuentan físicamente. En Inventario puedes abrir empaques y
              preparar medias cajas con ese conteo.
            </AlertDescription>
          </Alert>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
