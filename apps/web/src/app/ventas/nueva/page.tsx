import { NewSaleScreen } from '@/components/sales-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page() {
  return <NewSaleScreen session={await requireSession()} />;
}
