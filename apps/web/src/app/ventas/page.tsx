import { SalesScreen } from '@/components/sales-list-screen';
import { requireSession, webAuthConfig } from '@/lib/server-auth';
import { cookies } from 'next/headers';
import type { SaleSummary } from '@mm/domain';

async function initialSales(): Promise<SaleSummary[] | null> {
  const config = webAuthConfig();
  const token = (await cookies()).get(config.cookieName)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  try {
    const response = await fetch(`${config.apiBase}/api/sales?search=&limit=25&offset=0`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
      headers: {
        'x-mm-internal': process.env.MM_INTERNAL_TOKEN ?? '',
        Cookie: `${config.cookieName}=${token}`,
      },
    });
    if (!response.ok) return null;
    const rows: unknown = await response.json();
    return Array.isArray(rows) ? (rows as SaleSummary[]) : null;
  } catch {
    // A temporary read failure keeps the normal visible retry flow available.
    return null;
  }
}
export default async function Page() {
  const session = await requireSession();
  return (
    <SalesScreen session={session} initialRows={await initialSales()} initialReadAt={Date.now()} />
  );
}
