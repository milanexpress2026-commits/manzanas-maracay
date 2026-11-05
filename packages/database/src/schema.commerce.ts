import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  numeric,
  timestamp,
  date,
  index,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { sales, saleLines, payments, lots, containers, inventoryMovements } from './schema';
const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const saleAllocations = pgTable(
  'sale_allocations',
  {
    id: id(),
    saleLineId: uuid('sale_line_id')
      .notNull()
      .references(() => saleLines.id),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    movementId: uuid('movement_id')
      .notNull()
      .references(() => inventoryMovements.id),
    quantity: integer('quantity').notNull(),
    costUsd: numeric('cost_usd', { precision: 18, scale: 4 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('allocation_line_container_uq').on(t.saleLineId, t.containerId),
    unique('allocation_movement_container_uq').on(t.movementId, t.containerId),
    index('allocations_lot_idx').on(t.lotId),
    index('allocations_container_idx').on(t.containerId),
    index('allocations_movement_idx').on(t.movementId),
    check('sale_allocations_quantity_check', sql`${t.quantity}=1`),
    check('sale_allocations_cost_usd_check', sql`${t.costUsd}>=0`),
  ],
);
export const saleDateEvents = pgTable(
  'sale_date_events',
  {
    id: id(),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id),
    dueDate: date('due_date'),
    reminderDate: date('reminder_date'),
    reason: text('reason').notNull(),
    actor: text('actor').notNull(),
    eventOrder: bigint('event_order', { mode: 'number' }).generatedAlwaysAsIdentity(),
    createdAt: createdAt(),
  },
  (t) => [
    index('sale_dates_sale_order_idx').on(t.saleId, t.eventOrder),
    check('sale_date_events_reason_check', sql`length(btrim(${t.reason})) between 5 and 500`),
  ],
);
export const saleCancellations = pgTable(
  'sale_cancellations',
  {
    id: id(),
    saleId: uuid('sale_id')
      .notNull()
      .unique('sale_cancellations_sale_id_key')
      .references(() => sales.id),
    reason: text('reason').notNull(),
    actor: text('actor').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('sale_cancellations_reason_check', sql`length(btrim(${t.reason})) between 5 and 500`),
  ],
);
export const paymentReversals = pgTable(
  'payment_reversals',
  {
    id: id(),
    paymentId: uuid('payment_id')
      .notNull()
      .unique('payment_reversals_payment_id_key')
      .references(() => payments.id),
    reason: text('reason').notNull(),
    actor: text('actor').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('payment_reversals_reason_check', sql`length(btrim(${t.reason})) between 5 and 500`),
  ],
);
