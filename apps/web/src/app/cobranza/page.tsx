import { CollectionsScreen } from '@/components/collections-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page() {
  return <CollectionsScreen session={await requireSession()} />;
}
