import { ClientsScreen } from '@/components/clients-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page() {
  return <ClientsScreen session={await requireSession()} />;
}
