import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/manrope';
import './globals.css';
import './phase3.css';
export const metadata: Metadata = {
  title: 'Manzanas Maracay | Vista previa',
  description: 'Demostración pública con datos sintéticos y acceso privado a la operación de Manzanas Maracay.',
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
      <body>{children}<footer className="release-stamp">Vista previa fase 3 · {process.env.MM_RELEASE ?? 'demo-local'}</footer></body>
    </html>
  );
}
