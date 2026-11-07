import { SaleDetailScreen } from '@/components/sale-detail-screen';
import { requireSession } from '@/lib/server-auth';
import { notFound } from 'next/navigation';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ guardada?: string | string[] }>;
}) {
  const { id } = await params;
  const session = await requireSession('/ventas/' + id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  return (
    <SaleDetailScreen session={session} id={id} justSaved={(await searchParams).guardada === '1'} />
  );
}
