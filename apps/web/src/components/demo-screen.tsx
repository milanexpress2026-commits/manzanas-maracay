'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  Boxes,
  Box,
  CircleDollarSign,
  HandCoins,
  Home,
  Layers3,
  LockKeyhole,
  Menu,
  Package,
  Search,
  ShoppingCart,
  Truck,
  ChevronRight,
  Eye,
  Leaf,
  Info,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

export const demoSections = [
  'inicio',
  'catalogo',
  'inventario',
  'recepciones',
  'ventas',
  'cobranza',
] as const;
export type DemoSection = (typeof demoSections)[number];
const nav = [
  { key: 'inicio', label: 'Inicio', icon: Home },
  { key: 'catalogo', label: 'Catálogo', icon: Package },
  { key: 'inventario', label: 'Inventario', icon: Boxes },
  { key: 'recepciones', label: 'Recepciones', icon: Truck },
  { key: 'ventas', label: 'Ventas', icon: ShoppingCart },
  { key: 'cobranza', label: 'Cobranza', icon: HandCoins },
] as const;
// Public fixtures are authored examples. This module has no API, session or database dependency.
const products = [
  {
    name: 'Manzana Gala',
    line: 'Con blíster · Calibre 100',
    packing: '5 blíster por caja · ejemplo',
    formats: 'Caja, media caja y blíster',
    closed: 8,
    halves: 0,
    blisters: 0,
    color: 'apple',
    price: '40,00',
    note: 'El número de blíster de este ejemplo no confirma la regla comercial.',
  },
  {
    name: 'Manzana Gala',
    line: 'Con blíster · Calibre 88',
    packing: '5 blíster por caja · ejemplo',
    formats: 'Caja, media caja y blíster',
    closed: 2,
    halves: 0,
    blisters: 4,
    color: 'apple',
    price: 'Sin configurar',
    note: 'Tres cajas recibidas, un blíster retirado: quedan dos cajas cerradas y cuatro blíster intactos.',
  },
  {
    name: 'Manzana a granel',
    line: 'Sin blíster · Calibre 175',
    packing: 'Caja y media caja comercial',
    formats: 'Caja y media caja',
    closed: 8,
    halves: 1,
    blisters: null,
    color: 'green',
    price: 'Sin configurar',
    note: 'Diez cajas menos una caja y una media: ocho cajas cerradas y una media caja. Equivalencia comercial: 8,5 cajas.',
  },
  {
    name: 'Kiwi',
    line: 'Sin variedad comercial',
    packing: 'Caja 10 kg · media caja 5 kg',
    formats: 'Caja y media caja',
    closed: 2,
    halves: 1,
    blisters: null,
    color: 'kiwi',
    price: 'Sin configurar',
    note: 'Las presentaciones tienen peso definido. No se pesa ni se cuenta cada kiwi al registrar la venta.',
  },
  {
    name: 'Uva roja',
    line: 'Caja completa',
    packing: 'Solo cajas',
    formats: 'Caja',
    closed: 4,
    halves: 0,
    blisters: null,
    color: 'grape',
    price: 'Sin configurar',
    note: 'Se comercializa únicamente por caja; no se ofrecen kilos, gajos, racimos ni medias cajas.',
  },
  {
    name: 'Pera FORELLE',
    line: 'Calibre 110',
    packing: 'Blíster por confirmar',
    formats: 'Caja · fraccionamiento pendiente',
    closed: 6,
    halves: 0,
    blisters: null,
    color: 'pear',
    price: 'Sin configurar',
    note: 'Blíster por caja y preparación de medias cajas quedan pendientes de confirmar. No se inventan cantidades.',
  },
];
const invoices = [
  {
    number: 'DEMO-V001',
    name: 'Cliente de ejemplo A',
    total: '200,00',
    paid: '80,00',
    balance: '120,00',
    status: 'Pendiente',
  },
  {
    number: 'DEMO-V002',
    name: 'Cliente de ejemplo A',
    total: '150,00',
    paid: '0,00',
    balance: '150,00',
    status: 'Por vencer',
  },
  {
    number: 'DEMO-V003',
    name: 'Cliente de ejemplo A',
    total: '100,00',
    paid: '0,00',
    balance: '100,00',
    status: 'Vencida',
  },
];
function ProductMark({ color }: { color: string }) {
  return (
    <span className={`fruit-mark fruit-mark-${color}`} aria-hidden="true">
      <Leaf />
    </span>
  );
}
function DemoNote() {
  return (
    <p className="demo-note">
      <Info aria-hidden="true" />
      Datos sintéticos para revisar la experiencia. Esta vista no registra operaciones ni muestra
      información del negocio.
    </p>
  );
}
export function DemoScreen({ section }: { section: DemoSection }) {
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<{ title: string; text: string } | null>(null);
  const current = nav.find((item) => item.key === section)!;
  const filtered = products.filter((p) =>
    `${p.name} ${p.line}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es').trim()),
  );
  const navigation = (
    <>
      <Link href="/" className="sidebar-brand">
        <Image
          src="/brand/logo-manzanas-maracay.webp"
          alt="Manzanas Maracay · Frutas importadas"
          width={168}
          height={168}
          priority
        />
      </Link>
      <nav className="sidebar-nav" aria-label="Módulos de demostración">
        <p>Recorre la demostración</p>
        {nav.map((item) => (
          <Link
            key={item.key}
            href={item.key === 'inicio' ? '/demo' : `/demo/${item.key}`}
            onClick={() => setMenu(false)}
            className={section === item.key ? 'nav-active' : 'nav-link'}
            aria-current={section === item.key ? 'page' : undefined}
          >
            <item.icon aria-hidden="true" />
            {item.label}
            {section === item.key ? <ChevronRight aria-hidden="true" /> : null}
          </Link>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <Eye aria-hidden="true" />
          <p>
            Demostración pública
            <br />
            Solo lectura
          </p>
        </div>
        <Link href="/login" className="demo-internal-link">
          <LockKeyhole aria-hidden="true" />
          Acceso interno
        </Link>
      </div>
    </>
  );
  return (
    <div className="app-shell demo-shell">
      <a className="skip-link" href="#app-main">
        Saltar al contenido
      </a>
      <aside className="sidebar desktop-sidebar" aria-label="Navegación principal">
        {navigation}
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              aria-label="Abrir navegación"
              onClick={() => setMenu(true)}
            >
              <Menu />
            </Button>
            <span className="desktop-crumb">Demostración</span>
            <ChevronRight className="desktop-crumb" aria-hidden="true" />
            <span className="current-crumb">{current.label}</span>
          </div>
          <Link href="/login" className="demo-access">
            <LockKeyhole aria-hidden="true" />
            Acceso interno
          </Link>
        </header>
        <div className="preview-banner demo-banner">
          <strong>DEMO · Solo lectura</strong>
          <span>Datos de ejemplo · Sin acceso a operaciones privadas</span>
        </div>
        <main id="app-main" className="main-content demo-main" key={section}>
          {section === 'inicio' ? (
            <>
              <section className="demo-welcome">
                <div>
                  <p>Manzanas Maracay</p>
                  <h1>
                    Todo el negocio,
                    <br />a la vista.
                  </h1>
                  <span>
                    Explora cómo se conectan la recepción, el inventario, las ventas y la cobranza.
                  </span>
                </div>
                <div className="demo-welcome-seal">
                  <Boxes aria-hidden="true" />
                  <strong>
                    Del ingreso
                    <br />
                    al último abono
                  </strong>
                  <span>Un recorrido de ejemplo</span>
                </div>
              </section>
              <div className="commercial-metrics">
                <article>
                  <Box aria-hidden="true" />
                  <span>Cajas cerradas</span>
                  <strong>30</strong>
                  <small>Existencias de ejemplo</small>
                </article>
                <article>
                  <Layers3 aria-hidden="true" />
                  <span>Medias cajas</span>
                  <strong>2</strong>
                  <small>Separadas de las cajas cerradas</small>
                </article>
                <article>
                  <CircleDollarSign aria-hidden="true" />
                  <span>Saldo de ejemplo</span>
                  <strong>$ 370,00</strong>
                  <small>Después de un abono de USD 80</small>
                </article>
                <article className="metric-note">
                  <span>Tasa BCV</span>
                  <strong>No disponible</strong>
                  <small>Esta demo no presenta tasas de prueba como reales.</small>
                </article>
              </div>
              <div className="demo-home-grid">
                <section className="operations-panel">
                  <div className="panel-heading">
                    <Boxes aria-hidden="true" />
                    <h2>Lo que hay en la cava</h2>
                    <Link href="/demo/inventario">
                      Ver inventario
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </div>
                  <div className="demo-product-list">
                    {products.slice(0, 4).map((p) => (
                      <div key={p.name + p.line}>
                        <ProductMark color={p.color} />
                        <div>
                          <strong>{p.name}</strong>
                          <small>{p.line}</small>
                        </div>
                        <span>
                          {p.closed} cajas{p.halves ? ' + 1 media' : ''}
                          {p.blisters ? ' + 4 blíster' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="demo-flow-panel">
                  <h2>Una operación, paso a paso</h2>
                  <ol>
                    <li>
                      <span>1</span>
                      <div>
                        <strong>Llega la mercancía</strong>
                        <p>Cajas y costo registrados por recepción.</p>
                      </div>
                    </li>
                    <li>
                      <span>2</span>
                      <div>
                        <strong>Se confirma la venta</strong>
                        <p>Primero sale la mercancía más antigua.</p>
                      </div>
                    </li>
                    <li>
                      <span>3</span>
                      <div>
                        <strong>El cliente abona</strong>
                        <p>El dinero se aplica al comprobante elegido.</p>
                      </div>
                    </li>
                  </ol>
                  <Button asChild variant="outline">
                    <Link href="/demo/ventas">
                      Ver ventas de ejemplo
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </section>
              </div>
            </>
          ) : (
            <div className="page-heading">
              <div>
                <h1>
                  {section === 'catalogo'
                    ? 'Catálogo de productos'
                    : section === 'recepciones'
                      ? 'Recepción de mercancía'
                      : section === 'cobranza'
                        ? 'Centro de cobranza'
                        : current.label}
                </h1>
                <p>
                  {section === 'catalogo'
                    ? 'Cada fruta con las presentaciones que le corresponden.'
                    : section === 'inventario'
                      ? 'La existencia física y sus equivalencias, sin duplicar cantidades.'
                      : section === 'recepciones'
                        ? 'Un camión puede traer varios productos en un solo documento.'
                        : section === 'ventas'
                          ? 'Precios negociados, costos históricos y comprobantes claros.'
                          : 'Cada abono se aplica al comprobante elegido por el operador.'}
                </p>
              </div>
              <Badge variant="secondary">Ejemplo de solo lectura</Badge>
            </div>
          )}
          {section === 'catalogo' || section === 'inventario' ? (
            <section className="operations-panel">
              <div className="catalog-toolbar">
                <div className="search-field">
                  <Search aria-hidden="true" />
                  <Input
                    aria-label="Buscar productos de ejemplo"
                    placeholder="Buscar fruta, variedad o calibre…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <span>{filtered.length} productos de ejemplo</span>
              </div>
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Tabla de ejemplo: desplázate para ver todas las columnas"
              >
                <table className="commercial-table demo-table">
                  <caption className="sr-only">Productos sintéticos de la demostración</caption>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      {section === 'catalogo' ? (
                        <>
                          <th>Empaque</th>
                          <th>Venta permitida</th>
                        </>
                      ) : (
                        <>
                          <th>Cajas cerradas</th>
                          <th>Medias cajas</th>
                          <th>Blíster intactos</th>
                        </>
                      )}
                      <th>
                        <span className="sr-only">Detalle</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.name + p.line}>
                        <td>
                          <div className="product-cell">
                            <ProductMark color={p.color} />
                            <div>
                              <strong>{p.name}</strong>
                              <small>{p.line}</small>
                            </div>
                          </div>
                        </td>
                        {section === 'catalogo' ? (
                          <>
                            <td>{p.packing}</td>
                            <td>{p.formats}</td>
                          </>
                        ) : (
                          <>
                            <td>{p.closed}</td>
                            <td>{p.halves || '—'}</td>
                            <td>{p.blisters ?? 'No aplica / pendiente'}</td>
                          </>
                        )}
                        <td>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Ver detalle de ${p.name} ${p.line}`}
                            onClick={() => setDetail({ title: p.name, text: p.note })}
                          >
                            <ChevronRight />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filtered.length ? (
                <p className="empty-state">No hay coincidencias. Prueba con otra fruta.</p>
              ) : null}
              <div className="table-footer">
                <span>DEMO · Datos sintéticos</span>
                <span>Los filtros solo cambian esta vista</span>
              </div>
            </section>
          ) : null}
          {section === 'recepciones' ? (
            <div className="commercial-layout">
              <section className="operations-panel">
                <div className="panel-heading">
                  <Truck aria-hidden="true" />
                  <h2>Camión de ejemplo</h2>
                  <Badge variant="secondary">DEMO-R001</Badge>
                </div>
                <div className="demo-document-meta">
                  <span>
                    Proveedor<strong>Proveedor de ejemplo</strong>
                  </span>
                  <span>
                    Documento<strong>Recepción ilustrativa</strong>
                  </span>
                </div>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Tabla de ejemplo: desplázate para ver todas las columnas"
                >
                  <table className="commercial-table">
                    <caption className="sr-only">Recepción multiproducto de ejemplo</caption>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cajas</th>
                        <th>Costo / caja</th>
                        <th>Total costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Manzana Gala · Calibre 100', '20', '25,00', '500,00'],
                        ['Pera FORELLE · Calibre 110', '10', '28,00', '280,00'],
                        ['Uva roja', '2', '30,00', '60,00'],
                        ['Kiwi · Caja 10 kg', '1', '24,00', '24,00'],
                      ].map((row) => (
                        <tr key={row[0]}>
                          {row.map((cell, i) => (
                            <td key={i}>{i > 1 ? `USD ${cell}` : cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="inline-explanation">
                  Los costos de este documento son ejemplos. Cada recepción conserva sus propios
                  costos históricos.
                </p>
              </section>
              <aside className="commercial-summary">
                <h2>Resumen de recepción</h2>
                <dl>
                  <div>
                    <dt>Cajas recibidas</dt>
                    <dd>33</dd>
                  </div>
                  <div>
                    <dt>Costo de mercancía</dt>
                    <dd>USD 864,00</dd>
                  </div>
                  <div>
                    <dt>Precios comerciales</dt>
                    <dd>Conservar o actualizar</dd>
                  </div>
                </dl>
                <p>
                  El costo de compra y el precio de venta se definen por separado. Confirmar
                  registra todas las líneas juntas.
                </p>
                <Badge variant="secondary">Solo lectura · No se guarda</Badge>
              </aside>
            </div>
          ) : null}
          {section === 'ventas' ? (
            <div className="commercial-layout">
              <section className="operations-panel">
                <div className="panel-heading">
                  <ShoppingCart aria-hidden="true" />
                  <h2>Venta de ejemplo</h2>
                  <Badge variant="secondary">DEMO-V004</Badge>
                </div>
                <div className="demo-document-meta">
                  <span>
                    Cliente<strong>Cliente de ejemplo B</strong>
                  </span>
                  <span>
                    Condición<strong>Contado</strong>
                  </span>
                </div>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Tabla de ejemplo: desplázate para ver todas las columnas"
                >
                  <table className="commercial-table">
                    <caption className="sr-only">Venta sintética con costo FIFO</caption>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>Precio pactado</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <strong>Manzana Gala · Calibre 100</strong>
                          <small>Caja completa</small>
                        </td>
                        <td>12 cajas</td>
                        <td>USD 40,00</td>
                        <td>USD 480,00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="demo-fifo">
                  <h3>El costo sigue la antigüedad</h3>
                  <div>
                    <span>Primera recepción</span>
                    <strong>10 cajas × USD 25,00</strong>
                    <span>USD 250,00</span>
                  </div>
                  <div>
                    <span>Segunda recepción</span>
                    <strong>2 cajas × USD 27,00</strong>
                    <span>USD 54,00</span>
                  </div>
                  <p>
                    Quedan 8 cajas de la segunda recepción. La asignación contable se hace
                    automáticamente.
                  </p>
                </div>
              </section>
              <aside className="commercial-summary">
                <h2>Resumen de venta</h2>
                <dl>
                  <div>
                    <dt>Ingreso</dt>
                    <dd>USD 480,00</dd>
                  </div>
                  <div>
                    <dt>Costo FIFO</dt>
                    <dd>USD 304,00</dd>
                  </div>
                  <div className="summary-total">
                    <dt>Ganancia bruta</dt>
                    <dd>USD 176,00</dd>
                  </div>
                </dl>
                <p>Estimación de mercancía, sin gastos accesorios.</p>
                <Button
                  variant="outline"
                  onClick={() =>
                    setDetail({
                      title: 'Comprobante de venta · DEMO',
                      text: 'DEMO-V004 · Cliente de ejemplo B · 12 cajas de Manzana Gala calibre 100 a USD 40,00. Total USD 480,00. Este ejemplo no es una factura fiscal ni registra una venta.',
                    })
                  }
                >
                  Ver comprobante de ejemplo
                </Button>
              </aside>
            </div>
          ) : null}
          {section === 'cobranza' ? (
            <>
              <div className="commercial-metrics">
                <article>
                  <HandCoins aria-hidden="true" />
                  <span>Saldo de ejemplo</span>
                  <strong>USD 370,00</strong>
                  <small>Un cliente · tres comprobantes</small>
                </article>
                <article>
                  <CircleDollarSign aria-hidden="true" />
                  <span>Abono registrado</span>
                  <strong>USD 80,00</strong>
                  <small>Aplicado solo a DEMO-V001</small>
                </article>
                <article className="metric-note">
                  <span>Recordatorios</span>
                  <strong>En una tablet</strong>
                  <small>La suscripción se activa únicamente desde el acceso interno.</small>
                </article>
              </div>
              <section className="operations-panel">
                <div className="panel-heading">
                  <HandCoins aria-hidden="true" />
                  <h2>Cuenta del cliente de ejemplo A</h2>
                </div>
                <div
                  className="table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Tabla de ejemplo: desplázate para ver todas las columnas"
                >
                  <table className="commercial-table">
                    <caption className="sr-only">Saldos sintéticos por comprobante</caption>
                    <thead>
                      <tr>
                        <th>Comprobante</th>
                        <th>Total USD</th>
                        <th>Abonado USD</th>
                        <th>Saldo USD</th>
                        <th>Estado de ejemplo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((s) => (
                        <tr key={s.number}>
                          <td>
                            <strong>{s.number}</strong>
                            <small>{s.name}</small>
                          </td>
                          <td>{s.total}</td>
                          <td>{s.paid}</td>
                          <td>
                            <strong>{s.balance}</strong>
                          </td>
                          <td>
                            <span
                              className={`status-badge ${s.status === 'Vencida' ? 'status-danger' : 'status-pending'}`}
                            >
                              {s.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="demo-payment-note">
                  <strong>El operador elige dónde aplicar el dinero.</strong>
                  <p>
                    El abono de USD 80 reduce el primer comprobante de USD 200 a USD 120. Los otros
                    saldos se conservan.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setDetail({
                        title: 'Recibo de abono · DEMO',
                        text: 'DEMO-AB001 · Cliente de ejemplo A · USD 80,00 en efectivo aplicados a DEMO-V001. Saldo del comprobante: USD 120,00. Saldo total del cliente: USD 370,00. No se envió ningún mensaje.',
                      })
                    }
                  >
                    Ver recibo de ejemplo
                  </Button>
                </div>
              </section>
            </>
          ) : null}
          <DemoNote />
          <footer className="page-footer">
            <span>Manzanas Maracay · Frutas importadas</span>
            <Link href="/login">
              Acceso interno protegido
              <LockKeyhole aria-hidden="true" />
            </Link>
          </footer>
        </main>
      </div>
      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent className="navigation-dialog">
          <DialogTitle className="sr-only">Navegación de demostración</DialogTitle>
          <DialogDescription className="sr-only">Explora los módulos de ejemplo</DialogDescription>
          {navigation}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>Información sintética · Solo lectura</DialogDescription>
          </DialogHeader>
          <p className="demo-detail-text">{detail?.text}</p>
          <Button variant="outline" onClick={() => setDetail(null)}>
            Cerrar ejemplo
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
