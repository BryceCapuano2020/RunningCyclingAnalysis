import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** The account row every other table references. Its own file, so tables in other files can reference it. */
export const users = sqliteTable(
  'users',
  {
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
    /**
     * Stored lift sets, kept in step with lift_sets by the same batch that changes them. The cap is the
     * named check, so a write past it fails whole (migration 0012).
     */
    liftCount: integer('lift_count').notNull().default(0),
    /** Raised by every lift write and delete. The browser pulls lifts only when it moves. */
    liftRevision: integer('lift_revision').notNull().default(0),
    /**
     * One counter for every input of the account's results: raised by triggers (migration 0014) on every change to an
     * activity's digest, the profile, a dated setting or the account settings. The server's state job reads it.
     */
    libraryVersion: integer('library_version').notNull().default(0),
  },
  (t) => [check('users_lift_count_cap', sql`${t.liftCount} BETWEEN 0 AND 60000`)],
)
