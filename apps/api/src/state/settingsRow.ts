import { AccountSettingsSchema, NO_ACCOUNT_SETTINGS } from '@rca/contract'
import type { AccountSettings } from '@rca/contract'

/** The stored account settings, shared by the settings route and the state job that reads them. */
export interface SettingsRow {
  keep_power: string | null
  counted_runs: string | null
  period: string | null
  zone: string | null
}

/** A stored column: its JSON, or null for a field never set. A value that does not parse reads as never set. */
function parsed(text: string | null): unknown {
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** A stored row as the API shows it. A row that no longer fits the schema reads as never saved. */
export function toSettings(row: SettingsRow | null): AccountSettings {
  if (row === null) return NO_ACCOUNT_SETTINGS
  const read = AccountSettingsSchema.safeParse({
    keepPower: parsed(row.keep_power),
    countedRuns: parsed(row.counted_runs),
    period: parsed(row.period),
    ...(row.zone === null ? {} : { zone: row.zone }),
  })
  return read.success ? read.data : NO_ACCOUNT_SETTINGS
}
