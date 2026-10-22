import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  pictureUrl: text('picture_url'),
  createdAt: integer('created_at').notNull(),
})

export const oauthAccounts = sqliteTable(
  'oauth_accounts',
  {
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerUserId] })],
)

/** `id` is the SHA-256 hex of the session token; the token itself is never stored. */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  /**
   * Absolute lifetime starts here; refreshes never extend past createdAt + 90 days. The default
   * makes rows that predate this column read as created at epoch, so they are already expired.
   */
  createdAt: integer('created_at').notNull().default(0),
})

export const profiles = sqliteTable('profiles', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  massKg: real('mass_kg').notNull(),
  bikeMassKg: real('bike_mass_kg').notNull(),
  units: text('units', { enum: ['imperial', 'metric'] }).notNull(),
  keepFiles: integer('keep_files', { mode: 'boolean' }).notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const activities = sqliteTable(
  'activities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dedupeKey: text('dedupe_key').notNull(),
    sport: text('sport', { enum: ['run', 'ride'] }).notNull(),
    startMs: integer('start_ms').notNull(),
    name: text('name').notNull(),
    digestVersion: integer('digest_version').notNull(),
    digestJson: text('digest_json').notNull(),
    fileName: text('file_name').notNull(),
    fileHash: text('file_hash').notNull(),
    fileKey: text('file_key'),
    fileSize: integer('file_size'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    unique('activities_user_dedupe_unique').on(t.userId, t.dedupeKey),
    index('activities_user_start_idx').on(t.userId, t.startMs),
    index('activities_user_created_idx').on(t.userId, t.createdAt),
  ],
)

/** One deployment-wide meter for billable R2 writes and operations. */
export const r2StorageBudget = sqliteTable('r2_storage_budget', {
  id: integer('id').primaryKey(),
  lifetimePutBytes: integer('lifetime_put_bytes').notNull().default(0),
  monthlyPeriod: text('monthly_period').notNull(),
  monthlyOperations: integer('monthly_operations').notNull().default(0),
})

export const schema = { users, oauthAccounts, sessions, profiles, activities, r2StorageBudget }
