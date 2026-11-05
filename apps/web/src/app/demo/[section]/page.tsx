import { notFound } from 'next/navigation';
import { DemoScreen, type DemoSection } from '@/components/demo-screen';
import { webAuthConfig } from '@/lib/server-auth';
const sections = ['catalogo', 'inventario', 'recepciones', 'ventas', 'cobranza'];
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  if (webAuthConfig().environment === 'production') notFound();
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <DemoScreen section={section as DemoSection} />;
}
