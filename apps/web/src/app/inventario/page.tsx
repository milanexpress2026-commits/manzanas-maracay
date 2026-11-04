import { InventoryScreen } from '@/components/inventory-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ lote?: string | string[] }>;
}) {
  const session = await requireSession();
  const params = await searchParams;
  return (
    <InventoryScreen
      session={session}
      initialLotId={typeof params.lote === 'string' ? params.lote : undefined}
    />
  );
}
