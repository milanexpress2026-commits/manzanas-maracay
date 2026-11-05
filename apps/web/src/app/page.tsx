import { PublicHome } from '@/components/public-home';
import { redirect } from 'next/navigation';
import { getSession, webAuthConfig } from '@/lib/server-auth';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (webAuthConfig().environment === 'production')
    redirect((await getSession()) ? '/inicio' : '/login');
  return <PublicHome />;
}
