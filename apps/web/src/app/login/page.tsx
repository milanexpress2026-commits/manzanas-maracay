import { redirect } from 'next/navigation';
import { getSession, webAuthConfig } from '@/lib/server-auth';
import { LoginForm } from './login-form';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (await getSession()) redirect('/');
  return <LoginForm staging={webAuthConfig().environment === 'staging'} />;
}
