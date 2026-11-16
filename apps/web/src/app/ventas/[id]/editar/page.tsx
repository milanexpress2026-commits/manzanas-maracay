import { SaleAdditionScreen } from '@/components/sale-addition-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SaleAdditionScreen session={await requireSession()} id={id} />;
}
