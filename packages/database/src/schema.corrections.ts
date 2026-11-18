import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  numeric,
  timestamp,
  jsonb,
  index,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sales, saleLines, payments } from './schema';
import { saleAllocations } from './schema.commerce';
const id = () => uuid('id').primaryKey().defaultRandom();
const cents = (name: string) => numeric(name, { precision: 18, scale: 2 });
const event = () => ({
  actor: text('actor').notNull(),
  reason: text('reason').notNull(),
  creationTransaction: bigint('creation_transaction', { mode: 'bigint' })
    .notNull()
    .default(sql`txid_current()`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const saleReductions = pgTable(
  'sale_reductions',
  {
    id: id(),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id),
    expectedVersion: integer('expected_version').notNull(),
    reductionUsd: cents('reduction_usd').notNull(),
    excessUsd: cents('excess_usd').notNull(),
    resolution: text('resolution').notNull(),
    ...event(),
  },
  (t) => [
    index('reductions_sale_idx').on(t.saleId),
    unique('reduction_version_uq').on(t.saleId, t.expectedVersion),
    check(
      'reduction_values_valid',
      sql`${t.expectedVersion}>=0 and ${t.reductionUsd}>=0 and ${t.excessUsd}>=0 and ${t.excessUsd}<=${t.reductionUsd} and ${t.resolution} in ('none','refund','credit') and ((${t.excessUsd}=0 and ${t.resolution}='none') or (${t.excessUsd}>0 and ${t.resolution}<>'none'))`,
    ),
    check('reduction_reason_valid', sql`length(btrim(${t.reason})) between 5 and 500`),
  ],
);
export const saleReductionLines = pgTable(
  'sale_reduction_lines',
  {
    id: id(),
    reductionId: uuid('reduction_id')
      .notNull()
      .references(() => saleReductions.id),
    saleLineId: uuid('sale_line_id')
      .notNull()
      .references(() => saleLines.id),
    quantity: integer('quantity').notNull(),
    reductionUsd: cents('reduction_usd').notNull(),
  },
  (t) => [
    unique('reduction_line_uq').on(t.reductionId, t.saleLineId),
    index('reductions_line_idx').on(t.saleLineId),
    check('reduction_line_valid', sql`${t.quantity}>0 and ${t.reductionUsd}>=0`),
  ],
);
export const saleReductionAllocations = pgTable(
  'sale_reduction_allocations',
  {
    allocationId: uuid('allocation_id')
      .primaryKey()
      .references(() => saleAllocations.id),
    reductionLineId: uuid('reduction_line_id')
      .notNull()
      .references(() => saleReductionLines.id),
  },
  (t) => [index('reduction_allocations_line_idx').on(t.reductionLineId)],
);
export const paymentCorrections = pgTable(
  'payment_corrections',
  {
    id: id(),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id),
    expectedVersion: integer('expected_version').notNull(),
    amount: cents('amount').notNull(),
    amountUsd: cents('amount_usd').notNull(),
    applications: jsonb('applications').notNull(),
    kind: text('kind').notNull(),
    saleReductionId: uuid('sale_reduction_id').references(() => saleReductions.id),
    creditDeltaUsd: cents('credit_delta_usd').notNull(),
    ...event(),
  },
  (t) => [
    unique('payment_correction_version_uq').on(t.paymentId, t.expectedVersion),
    index('correction_reduction_idx').on(t.saleReductionId),
    check(
      'correction_values_valid',
      sql`${t.expectedVersion}>=0 and ${t.amount}>=0 and ${t.amountUsd}>=0 and ${t.kind} in ('entry','refund','credit') and ((${t.kind}='entry' and ${t.saleReductionId} is null and ${t.creditDeltaUsd}=0) or (${t.kind}<>'entry' and ${t.saleReductionId} is not null)) and jsonb_typeof(${t.applications})='array'`,
    ),
    check('correction_reason_valid', sql`length(btrim(${t.reason})) between 5 and 500`),
  ],
);
