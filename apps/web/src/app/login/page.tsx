import { redirect } from 'next/navigation';
import { getSession, webAuthConfig } from '@/lib/server-auth';
import { LoginForm } from './login-form';
import { internalReturnPath } from '@/lib/auth-return';
export const dynamic = 'force-dynamic';
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const environment = webAuthConfig().environment;
  const returnTo = internalReturnPath((await searchParams).returnTo);
  if (await getSession())
    redirect(returnTo ?? (environment === 'production' ? '/inicio' : '/catalogo'));
  return <LoginForm environment={environment} returnTo={returnTo} />;
}
