import { SuppliersScreen } from '@/components/suppliers-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page() {
  return <SuppliersScreen session={await requireSession()} />;
}
