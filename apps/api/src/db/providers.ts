import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { INBOX_STATES, PROVIDERS } from '@rca/contract'
import { users } from './users.ts'

/**
 * An account's link to a provider that pushes new activities (docs/design/garmin-sync.md decision 2). One provider
 * account links to one RCA account. The tokens are one AES-GCM ciphertext under the Worker secret named by `key_id`,
 * with the user id and provider as associated data (garmin/tokens.ts); they never reach the browser. A link never
 * signs anyone in.
 */
export const providerLinks = sqliteTable(
  'provider_links',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: PROVIDERS }).notNull(),
    providerUserId: text('provider_user_id').notNull(),
    tokenCiphertext: text('token_ciphertext').notNull(),
    keyId: text('key_id').notNull(),
    scopes: text('scopes').notNull(),
    linkedAt: integer('linked_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.provider] }),
    uniqueIndex('provider_links_provider_user_unique').on(t.provider, t.providerUserId),
  ],
)

/**
 * The ingest ledger (garmin-sync.md decision 2): what a provider pushed and what became of it. A repeated push is a
 * no-op on the unique key. `file_key` names the waiting object under `users/{userId}/inbox/`, and is null once the
 * file is gone. Maintenance deletes settled rows (inbox/expiry.ts).
 */
export const inboxItems = sqliteTable(
  'inbox_items',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: PROVIDERS }).notNull(),
    providerActivityId: text('provider_activity_id').notNull(),
    fileKey: text('file_key'),
    fileSize: integer('file_size').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    state: text('state', { enum: INBOX_STATES }).notNull().default('pending'),
    reason: text('reason'),
    receivedAt: integer('received_at').notNull(),
  },
  (t) => [
    uniqueIndex('inbox_items_user_provider_activity_unique').on(
      t.userId,
      t.provider,
      t.providerActivityId,
    ),
    /** Serves maintenance's expiry, oldest first within a state. */
    index('inbox_items_state_received_idx').on(t.state, t.receivedAt),
    check('inbox_items_state_check', sql`${t.state} IN ('pending', 'done', 'failed')`),
    check('inbox_items_file_size_check', sql`${t.fileSize} >= 0`),
  ],
)
