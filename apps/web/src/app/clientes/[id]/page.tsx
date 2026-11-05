import { ClientAccountScreen } from '@/components/clients-screen';
import { requireSession } from '@/lib/server-auth';
import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <ClientAccountScreen session={session} id={id} />;
}
