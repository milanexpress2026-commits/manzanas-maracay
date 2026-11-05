import { SalesScreen } from '@/components/sales-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page() {
  return <SalesScreen session={await requireSession()} />;
}
