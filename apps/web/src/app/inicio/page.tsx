import { OperationsHome } from '@/components/operations-home';
import { requireSession } from '@/lib/server-auth';
export const dynamic = 'force-dynamic';
export default async function Page() {
  return <OperationsHome session={await requireSession()} />;
}
