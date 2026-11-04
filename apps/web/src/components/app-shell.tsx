'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Package,
  Boxes,
  Truck,
  Users,
  ChevronRight,
  Menu,
  LogOut,
  Leaf,
  BookOpen,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
export type AppSession = {
  user: { id: string; username: string; displayName: string };
  environment: 'local' | 'test' | 'staging';
};
const navigation = [
  { href: '/', label: 'Catálogo', icon: Package },
  { href: '/inventario', label: 'Inventario', icon: Boxes },
  { href: '/recepciones', label: 'Recepciones', icon: Truck },
  { href: '/proveedores', label: 'Proveedores', icon: Users },
];
function BrandLogo({ size }: { size: number }) {
  return (
    <Image
      src="/brand/logo-manzanas-maracay.webp"
      alt="Manzanas Maracay · Frutas importadas"
      width={size}
      height={size}
      sizes={`${size}px`}
      className="brand-logo"
      loading="eager"
    />
  );
}
export function AppShell({
  session,
  current,
  onGuide,
  children,
}: {
  session: AppSession;
  current: string;
  onGuide?: () => void;
  children: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const label = navigation.find((item) => item.href === current)?.label ?? 'Gestión';
  const preview = session.environment !== 'local';
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  async function logout() {
    setLoggingOut(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok && response.status !== 401)
        throw new Error('No se pudo cerrar la sesión. Vuelve a intentarlo.');
      window.location.assign('/login');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cerrar la sesión.');
      setLoggingOut(false);
    }
  }
  const sidebar = (
    <>
      <div className="sidebar-brand">
        <BrandLogo size={180} />
      </div>
      <nav className="sidebar-nav" aria-label="Módulos">
        <p>Tu negocio</p>
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current === item.href ? 'page' : undefined}
            className={current === item.href ? 'nav-active' : 'nav-link'}
            onClick={() => setMenu(false)}
          >
            <item.icon aria-hidden="true" />
            {item.label}
            {current === item.href ? <ChevronRight aria-hidden="true" /> : null}
          </Link>
        ))}
        <p className="upcoming-label">Próximas fases</p>
        <div className="nav-upcoming">Ventas y cobranza</div>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <Leaf aria-hidden="true" />
          <p>
            La calidad empieza
            <br />
            por el origen.
          </p>
        </div>
        {onGuide ? (
          <button
            onClick={() => {
              setMenu(false);
              onGuide();
            }}
          >
            <BookOpen aria-hidden="true" />
            Guía del catálogo
            <ArrowUpRight aria-hidden="true" />
          </button>
        ) : null}
        <div className="sidebar-version">
          <span className="status-dot" />
          Fase 2 · Inventario
        </div>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#app-main">
        Saltar al contenido
      </a>
      <aside className="sidebar desktop-sidebar" aria-label="Navegación principal">
        {sidebar}
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
            <span className="desktop-crumb">Gestión comercial</span>
            <ChevronRight className="desktop-crumb" aria-hidden="true" />
            <span className="current-crumb">{label}</span>
          </div>
          <div className="mobile-brand">
            <BrandLogo size={80} />
          </div>
          <div className="topbar-right">
            <span className="local-label">
              <ShieldCheck aria-hidden="true" />
              {preview ? 'Vista previa' : 'Entorno local'}
            </span>
            <span className="owner-name">{session.user.displayName}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cerrar sesión"
              disabled={loggingOut}
              onClick={() => void logout()}
            >
              <LogOut />
            </Button>
          </div>
        </header>
        {preview ? (
          <div className="preview-banner" role="status">
            <strong>ENTORNO DE PRUEBAS</strong>
            <span>Vista previa para socios · Sin facturación ni cobros reales</span>
          </div>
        ) : null}
        {error ? (
          <Alert variant="destructive" className="session-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {children}
      </div>
      <Dialog open={menu} onOpenChange={setMenu}>
        <DialogContent className="navigation-dialog">
          <DialogTitle className="sr-only">Navegación principal</DialogTitle>
          <DialogDescription className="sr-only">Módulos de Manzanas Maracay</DialogDescription>
          {sidebar}
        </DialogContent>
      </Dialog>
    </div>
  );
}
