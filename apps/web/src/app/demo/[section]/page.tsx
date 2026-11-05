import { notFound } from 'next/navigation';
import { DemoScreen, type DemoSection } from '@/components/demo-screen';
const sections = ['catalogo', 'inventario', 'recepciones', 'ventas', 'cobranza'];
export const dynamicParams = false;
export function generateStaticParams() {
  return sections.map((section) => ({ section }));
}
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <DemoScreen section={section as DemoSection} />;
}
