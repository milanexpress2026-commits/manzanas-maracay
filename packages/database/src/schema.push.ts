import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  integer,
  text,
  boolean,
  timestamp,
  date,
  unique,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { appUsers } from './schema.auth';
import { sales } from './schema';

export const pushDevices = pgTable(
  'push_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slot: integer('slot').notNull().default(1),
    generation: uuid('generation').notNull().defaultRandom(),
    deviceLabel: text('device_label').notNull(),
    endpoint: text('endpoint'),
    p256dh: text('p256dh'),
    auth: text('auth'),
    active: boolean('active').notNull().default(true),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => appUsers.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('push_single_device_uq').on(t.slot),
    check('push_single_device_slot', sql`${t.slot}=1`),
    check('push_label_valid', sql`length(btrim(${t.deviceLabel})) between 2 and 80`),
    check(
      'push_active_keys',
      sql`not ${t.active} or (${t.endpoint} is not null and ${t.p256dh} is not null and ${t.auth} is not null)`,
    ),
  ],
);

export const pushNotices = pgTable(
  'push_notices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id),
    reminderDate: date('reminder_date').notNull(),
    deviceGeneration: uuid('device_generation').notNull(),
    batchId: uuid('batch_id').notNull(),
    status: text('status').notNull().default('claimed'),
    resultCode: text('result_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    unique('push_notice_sale_date_uq').on(t.saleId, t.reminderDate),
    index('push_notice_batch_idx').on(t.batchId),
    check(
      'push_notice_status_valid',
      sql`${t.status} in ('claimed','accepted','failed','uncertain','cancelled')`,
    ),
  ],
);
