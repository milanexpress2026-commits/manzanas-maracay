import { ReceiptScreen } from '@/components/receipt-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page() {
  return <ReceiptScreen session={await requireSession()} />;
}
