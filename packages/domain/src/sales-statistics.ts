import { z } from 'zod';

export const statisticsFilterSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    seller: z.enum(['all', 'carlos', 'randy', 'unassigned']).default('all'),
    group: z.enum(['products', 'clients', 'sales']).default('products'),
    page: z.coerce.number().int().min(0).max(100000).default(0),
    variantId: z.uuid().optional(),
    clientId: z.uuid().optional(),
  })
  .strict()
  .refine((v) => v.from <= v.to, 'La fecha inicial debe ser anterior a la final.');
export type StatisticsFilter = z.infer<typeof statisticsFilterSchema>;
export type StatisticsTotals = {
  boxes: string;
  totalUsd: string;
  saleCount: number;
  clientCount: number;
  unknownLines: number;
};
export type StatisticsRow = StatisticsTotals & {
  key: string;
  variantId: string | null;
  description: string | null;
  clientId: string | null;
  clientName: string | null;
  saleId: string | null;
  number: string | null;
  soldAt: string | null;
  seller: 'carlos' | 'randy' | null;
};
export type SalesStatistics = {
  filter: StatisticsFilter;
  totals: StatisticsTotals;
  sellers: (StatisticsTotals & { seller: 'carlos' | 'randy' | null })[];
  rows: StatisticsRow[];
  rowCount: number;
  pageSize: number;
};
