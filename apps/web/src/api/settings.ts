import { AccountSettingsSchema } from '@rca/contract'
import type { AccountSettings } from '@rca/contract'
import { readJson, request } from './client'

/** The document is at most 20,000 counted runs of about 17 bytes each, and the rides and period beside them. */
const BODY_LIMIT = 512 * 1024

/** The account's settings; a field never set is null. */
export async function getAccountSettings(userId?: string): Promise<AccountSettings> {
  return readJson(
    await request('GET', '/api/settings', undefined, userId),
    AccountSettingsSchema,
    BODY_LIMIT,
  )
}

/** Replaces the account's settings whole; a null field is cleared. */
export async function putAccountSettings(
  settings: AccountSettings,
  userId?: string,
): Promise<AccountSettings> {
  return readJson(
    await request('PUT', '/api/settings', { json: settings }, userId),
    AccountSettingsSchema,
    BODY_LIMIT,
  )
}
