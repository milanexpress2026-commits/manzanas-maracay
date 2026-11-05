import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Boxes, Truck, ShoppingCart, HandCoins, ShieldCheck, Leaf } from 'lucide-react';
import { Button } from './ui/button';

const journey = [
  {
    title: 'Recibe',
    text: 'Un camión, varios productos. Cada costo conserva su historia.',
    icon: Truck,
  },
  {
    title: 'Organiza',
    text: 'Cajas, medias cajas y blíster: cada presentación en su lugar.',
    icon: Boxes,
  },
  {
    title: 'Vende',
    text: 'Precios pactados y salida de la mercancía por antigüedad.',
    icon: ShoppingCart,
  },
  {
    title: 'Cobra',
    text: 'Abonos por comprobante y un saldo claro para cada cliente.',
    icon: HandCoins,
  },
];

export function PublicHome() {
  return (
    <div className="public-home">
      <a className="skip-link" href="#public-main">
        Saltar al contenido
      </a>
      <header className="public-header">
        <Link href="/" aria-label="Manzanas Maracay, inicio">
          <Image
            src="/brand/logo-manzanas-maracay.webp"
            width={96}
            height={96}
            alt="Manzanas Maracay · Frutas importadas"
            priority
          />
        </Link>
        <span className="public-header-note">Frutas importadas. Negocio en orden.</span>
        <Button asChild variant="outline">
          <Link href="/login">
            <ShieldCheck aria-hidden="true" />
            Acceso interno
          </Link>
        </Button>
      </header>
      <main id="public-main">
        <section className="public-hero">
          <div className="public-hero-copy">
            <p className="public-demo-label">
              <span />
              Vista previa para nuestros socios
            </p>
            <h1>
              De la cava
              <br />a cada cliente.
            </h1>
            <p className="public-intro">
              Una forma más clara de recibir mercancía, cuidar el inventario y acompañar cada venta
              hasta su cobro.
            </p>
            <Button asChild size="lg">
              <Link href="/demo">
                Explorar demostración
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <p className="public-disclosure">
              Entra sin contraseña. Todos los datos son de ejemplo y la demostración es de solo
              lectura.
            </p>
          </div>
          <div className="public-brand-panel">
            <Image
              src="/brand/logo-manzanas-maracay.webp"
              width={400}
              height={400}
              sizes="(max-width: 700px) 250px, 400px"
              alt="Logo oficial de Manzanas Maracay"
              priority
            />
            <div className="brand-panel-note">
              <Leaf aria-hidden="true" />
              <span>La calidad empieza por el origen.</span>
            </div>
          </div>
        </section>
        <section className="public-journey" aria-label="Recorrido de la mercancía">
          {journey.map(({ title, text, icon: Icon }) => (
            <article key={title}>
              <Icon aria-hidden="true" />
              <h2>{title}</h2>
              <p>{text}</p>
            </article>
          ))}
        </section>
        <section className="public-private-note">
          <ShieldCheck aria-hidden="true" />
          <div>
            <h2>La operación del negocio tiene su propio acceso.</h2>
            <p>
              El catálogo interno, los clientes y las operaciones se consultan únicamente con una
              cuenta invitada.
            </p>
          </div>
          <Link href="/login">
            Entrar al negocio
            <ArrowRight aria-hidden="true" />
          </Link>
        </section>
      </main>
      <footer className="public-footer">
        <span>Manzanas Maracay · Frutas importadas</span>
        <span>Fase 3 · Entorno de pruebas</span>
      </footer>
    </div>
  );
}
