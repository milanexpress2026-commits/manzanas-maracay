import { SalesStatisticsScreen } from '@/components/sales-statistics-screen';
import { requireSession } from '@/lib/server-auth';
export default async function Page() {
  return <SalesStatisticsScreen session={await requireSession('/estadisticas')} />;
}
