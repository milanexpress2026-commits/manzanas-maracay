import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const appUsers = pgTable(
  'app_users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('app_users_username_uq').on(t.username),
    check('app_users_username_valid', sql`${t.username} ~ '^[a-z0-9][a-z0-9._@+-]{2,79}$'`),
    check('app_users_display_name_valid', sql`length(btrim(${t.displayName})) between 2 and 100`),
    check('app_users_hash_valid', sql`length(${t.passwordHash}) between 80 and 512`),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUsers.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('auth_sessions_user_idx').on(t.userId),
    index('auth_sessions_expiry_idx').on(t.expiresAt),
    check('auth_session_hash_valid', sql`${t.tokenHash} ~ '^[a-f0-9]{64}$'`),
    check('auth_session_expiry_valid', sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

export const authLoginBuckets = pgTable(
  'auth_login_buckets',
  {
    bucketKey: text('bucket_key').primaryKey(),
    attempts: integer('attempts').notNull(),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_login_buckets_updated_idx').on(t.updatedAt),
    check('auth_login_attempts_valid', sql`${t.attempts} >= 0`),
  ],
);
