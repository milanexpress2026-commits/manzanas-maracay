import { SaleDetailScreen } from '@/components/sale-detail-screen';
import { requireSession } from '@/lib/server-auth';
import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return <SaleDetailScreen session={session} id={id} />;
}
