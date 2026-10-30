import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { MEASUREMENT_KINDS } from '@rca/core/athlete'

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
  /** Digest JSON bytes this user stores, kept in step with activities rows. Capped per user. */
  digestBytes: integer('digest_bytes').notNull().default(0),
  /**
   * Original-file bytes this user stores or has reserved: the sum of their activities' file_size.
   * Triggers on activities (migration 0008) keep it in step, so no writer has to. Capped per user.
   */
  fileBytes: integer('file_bytes').notNull().default(0),
  /** The last continuation cursor the server issued for this user's library, spent once. */
  listCursor: text('list_cursor'),
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
    /** One identity per user and provider, so linking cannot attach a second one. */
    uniqueIndex('oauth_accounts_user_provider_unique').on(t.userId, t.provider),
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

export const profiles = sqliteTable(
  'profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null until the rider enters a body weight. Nothing assumes one. */
    massKg: real('mass_kg'),
    bikeMassKg: real('bike_mass_kg').notNull(),
    units: text('units', { enum: ['imperial', 'metric'] }).notNull(),
    keepFiles: integer('keep_files', { mode: 'boolean' }).notNull(),
    /** Only used for age grading. Null until the rider sets it. */
    birthYear: integer('birth_year'),
    sex: text('sex', { enum: ['female', 'male'] }),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [check('profiles_sex_check', sql`${t.sex} IS NULL OR ${t.sex} IN ('female', 'male')`)],
)

/**
 * The athlete's dated settings: a body mass, maximum heart rate or threshold in effect from a local
 * date. A row is identified by its kind, sport and date, so a second value for the same date replaces
 * the first. `sport` is '' for the body mass, which is not a sport's.
 */
export const athleteMeasurements = sqliteTable(
  'athlete_measurements',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: MEASUREMENT_KINDS }).notNull(),
    sport: text('sport', { enum: ['', 'run', 'ride'] })
      .notNull()
      .default(''),
    /** The local calendar date the value takes effect, YYYY-MM-DD. */
    fromDate: text('from_date').notNull(),
    /** Kg, bpm, W or m/s, by kind. */
    value: real('value').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind, t.sport, t.fromDate] }),
    check(
      'athlete_measurements_kind_check',
      sql`${t.kind} IN ('massKg', 'maxHeartRate', 'thresholdPower', 'thresholdPace')`,
    ),
    check('athlete_measurements_sport_check', sql`${t.sport} IN ('', 'run', 'ride')`),
  ],
)

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
    /**
     * The upload slot of the request that holds the file_size reservation. Only that request
     * releases it. A slot that has expired no longer holds it.
     */
    fileReservationToken: text('file_reservation_token'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    unique('activities_user_dedupe_unique').on(t.userId, t.dedupeKey),
    index('activities_user_start_idx').on(t.userId, t.startMs),
    index('activities_user_created_idx').on(t.userId, t.createdAt),
    /** Serves the library listing's keyset (created_at, id) in order, with no sort and no sort step. */
    index('activities_user_created_id_idx').on(t.userId, t.createdAt, t.id),
  ],
)

/** One deployment-wide meter for billable R2 writes and operations, reset each UTC month. */
export const r2StorageBudget = sqliteTable('r2_storage_budget', {
  id: integer('id').primaryKey(),
  /** Every PUT charge since the table was created. Never reset; enforced against the 4 GiB cap. */
  lifetimePutBytes: integer('lifetime_put_bytes').notNull().default(0),
  monthlyPeriod: text('monthly_period').notNull(),
  monthlyOperations: integer('monthly_operations').notNull().default(0),
  /** PUT bytes charged in monthlyPeriod. Enforced against MAX_MONTHLY_R2_PUT_BYTES. */
  monthlyPutBytes: integer('monthly_put_bytes').notNull().default(0),
  /** Where the orphaned-object sweep resumes listing, or null when it starts from the beginning. */
  orphanSweepCursor: text('orphan_sweep_cursor'),
  /** Independent ceilings for unauthenticated deep-health HEAD probes. */
  healthProbeDay: text('health_probe_day').notNull().default(''),
  healthProbeDayCount: integer('health_probe_day_count').notNull().default(0),
  healthProbeMonth: text('health_probe_month').notNull().default(''),
  healthProbeMonthCount: integer('health_probe_month_count').notNull().default(0),
  /** Last-seen database size in bytes, from the D1 statement meta. The create guard reads it. */
  d1SizeBytes: integer('d1_size_bytes').notNull().default(0),
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

/**
 * A Google identity's daily counts, saved when its account is deleted and restored if it signs up
 * again the same UTC day, so deleting and signing in again does not reset a budget. `identity_key`
 * is an HMAC of the Google subject, never the subject. No foreign key: the user is gone. Rows older
 * than yesterday are pruned. `accountCreate` rows count the accounts the identity has created.
 */
export const identityBudget = sqliteTable(
  'identity_budget',
  {
    identityKey: text('identity_key').notNull(),
    /** UTC calendar day, YYYY-MM-DD. */
    day: text('day').notNull(),
    action: text('action').notNull(),
    used: integer('used').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.identityKey, t.day, t.action] }),
    index('identity_budget_day_idx').on(t.day),
  ],
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
  athleteMeasurements,
  activities,
  r2StorageBudget,
  dailyBudget,
  identityBudget,
  uploadSlots,
  pendingAccountDeletions,
}
