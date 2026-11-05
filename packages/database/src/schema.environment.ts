import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const runtimeEnvironment = pgTable(
  'runtime_environment',
  {
    singleton: boolean('singleton').primaryKey().default(true),
    environment: text('environment').notNull(),
    databaseName: text('database_name').notNull(),
    databaseInstanceId: uuid('database_instance_id').notNull().defaultRandom(),
    ownerRole: text('owner_role').notNull(),
    applicationRole: text('application_role').notNull(),
    purpose: text('purpose').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('runtime_singleton_true', sql`${t.singleton}`),
    check(
      'runtime_environment_valid',
      sql`${t.environment} in ('local','test','staging','production')`,
    ),
    check(
      'runtime_purpose_valid',
      sql`${t.purpose} in ('development','quality_assurance','automated_test','operation','production_regression')`,
    ),
  ],
);
