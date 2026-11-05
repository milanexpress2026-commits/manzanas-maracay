import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/manrope';
import './globals.css';
import './phase3.css';
import './operations-home.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Manzanas Maracay | Gestión comercial',
  description: 'Gestión privada de catálogo, mercancía, ventas y cobranza de Manzanas Maracay.',
  robots: { index: false, follow: false },
  applicationName: 'Manzanas Maracay',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: { url: '/icons/favicon-64.png', type: 'image/png', sizes: '64x64' },
    apple: { url: '/icons/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
  },
  appleWebApp: { capable: true, title: 'Manzanas Maracay', statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#123c2c' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {children}
        <footer className="release-stamp">
          Manzanas Maracay · {process.env.MM_RELEASE ?? 'Desarrollo local'}
        </footer>
      </body>
    </html>
  );
}
