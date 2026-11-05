import { DemoScreen } from '@/components/demo-screen';
import { notFound } from 'next/navigation';
import { webAuthConfig } from '@/lib/server-auth';
export const dynamic = 'force-dynamic';
export default function Page() {
  if (webAuthConfig().environment === 'production') notFound();
  return <DemoScreen section="inicio" />;
}
