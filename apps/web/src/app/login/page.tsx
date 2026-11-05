import { redirect } from 'next/navigation';
import { getSession, webAuthConfig } from '@/lib/server-auth';
import { LoginForm } from './login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  const environment = webAuthConfig().environment;
  if (await getSession()) redirect(environment === 'production' ? '/inicio' : '/catalogo');
  return <LoginForm environment={environment} />;
}
