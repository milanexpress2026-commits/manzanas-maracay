import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/manrope';
import './globals.css';
export const metadata: Metadata = {
  title: 'Catálogo | Manzanas Maracay',
  description: 'Catálogo de frutas, variedades, calibres y empaques de Manzanas Maracay.',
  applicationName: 'Manzanas Maracay',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: 'Manzanas Maracay', statusBarStyle: 'default' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#123c2c' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
