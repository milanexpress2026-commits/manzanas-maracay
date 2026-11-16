import { SellerSummaryScreen } from '@/components/seller-summary-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page() {
  return <SellerSummaryScreen session={await requireSession()} />;
}
