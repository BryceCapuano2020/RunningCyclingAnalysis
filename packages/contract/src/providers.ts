import './zodConfig.ts'
import { z } from 'zod'

/**
 * The services an account can link to bring in new activities without a file (docs/design/garmin-sync.md). A link is
 * never a sign-in: signing in stays with `oauth_accounts`.
 */
export const PROVIDERS = ['garmin'] as const
export const ProviderSchema = z.enum(PROVIDERS)
export type Provider = z.infer<typeof ProviderSchema>

/**
 * Where an activity came from: a file the athlete added, or a provider's push. Set when the activity is created and
 * never changed by a later duplicate. The connector leaves out what came from Garmin until its terms are read
 * (garmin-sync.md section 7).
 */
export const ACTIVITY_SOURCES = ['file', 'garmin'] as const
export const ActivitySourceSchema = z.enum(ACTIVITY_SOURCES)
export type ActivitySource = z.infer<typeof ActivitySourceSchema>

/**
 * An inbox item's state, the ingest ledger: `pending` until the consumer saves its summary (`done`) or gives up on it
 * (`failed`, with the reason). The file is gone once the item is `done`.
 */
export const INBOX_STATES = ['pending', 'done', 'failed'] as const
export const InboxStateSchema = z.enum(INBOX_STATES)
export type InboxState = z.infer<typeof InboxStateSchema>
