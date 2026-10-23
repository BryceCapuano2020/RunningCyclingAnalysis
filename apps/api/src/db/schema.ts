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
  /** Stored activities, kept in step with activities rows by the same statements that change them. */
  activityCount: integer('activity_count').notNull().default(0),
  /** Set when account deletion starts. A deleting account can only finish its own deletion. */
  deletingAt: integer('deleting_at'),
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
  (t) => [
    primaryKey({ columns: [t.provider, t.providerUserId] }),
    index('oauth_accounts_user_idx').on(t.userId),
  ],
)

/** `id` is the SHA-256 hex of the session token; the token itself is never stored. */
export const sessions = sqliteTable(
  'sessions',
  {
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
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

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

/** One deployment-wide meter for billable R2 writes and operations, reset each UTC month. */
export const r2StorageBudget = sqliteTable('r2_storage_budget', {
  id: integer('id').primaryKey(),
  /** Audit total of every PUT charge since the table was created. No longer enforced. */
  lifetimePutBytes: integer('lifetime_put_bytes').notNull().default(0),
  monthlyPeriod: text('monthly_period').notNull(),
  monthlyOperations: integer('monthly_operations').notNull().default(0),
  /** PUT bytes charged in monthlyPeriod. Enforced against MAX_MONTHLY_R2_PUT_BYTES. */
  monthlyPutBytes: integer('monthly_put_bytes').notNull().default(0),
  /** Where the orphaned-object sweep resumes listing, or null when it starts from the beginning. */
  orphanSweepCursor: text('orphan_sweep_cursor'),
})

/** Requests of one kind by one user on one UTC day. Rows older than a week are pruned. */
export const dailyBudget = sqliteTable(
  'daily_budget',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** UTC calendar day, YYYY-MM-DD. */
    day: text('day').notNull(),
    action: text('action').notNull(),
    used: integer('used').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day, t.action] })],
)

/** Concurrent original-file uploads. A slot expires so that a crashed request cannot hold it. */
export const uploadSlots = sqliteTable(
  'upload_slots',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    slotId: text('slot_id').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.slotId] }),
    index('upload_slots_expires_idx').on(t.expiresAt),
  ],
)

/**
 * Accounts whose deletion has started and not finished. No foreign key: the user row is deleted
 * during the process, and this row is what the scheduler finishes after an interruption.
 */
export const pendingAccountDeletions = sqliteTable('pending_account_deletions', {
  userId: text('user_id').primaryKey().notNull(),
  requestedAt: integer('requested_at').notNull(),
  /** 1 while the account may still have R2 objects to remove; 0 once it has none. */
  sweepPending: integer('sweep_pending').notNull().default(1),
})

export const schema = {
  users,
  oauthAccounts,
  sessions,
  profiles,
  activities,
  r2StorageBudget,
  dailyBudget,
  uploadSlots,
  pendingAccountDeletions,
}
