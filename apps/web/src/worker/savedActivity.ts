import type { ActivityDigest } from '@rca/core/types'
import type { SavedActivity } from './protocol'

/** How a saved activity is listed, from the account library or the one kept in this browser. */
export function savedActivityOf(id: string, digest: ActivityDigest): SavedActivity {
  return { id, name: digest.name, startMs: digest.startMs, sport: digest.sport }
}
