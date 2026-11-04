import { CatalogScreen } from '@/components/catalog-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page() {
  const session = await requireSession();
  return <CatalogScreen session={session} />;
}
