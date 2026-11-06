import { ReceiptScreen } from '@/components/receipt-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    producto?: string | string[];
    opcion?: string | string[];
    returnTo?: string | string[];
  }>;
}) {
  const params = await searchParams;
  return (
    <ReceiptScreen
      session={await requireSession()}
      initialConfigurationId={typeof params.producto === 'string' ? params.producto : ''}
      initialOptionKey={typeof params.opcion === 'string' ? params.opcion : ''}
      returnToSale={params.returnTo === '/ventas/nueva'}
    />
  );
}
