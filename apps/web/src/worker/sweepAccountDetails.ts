import { workbenchExists } from './workbenchExists'
import { accountsWithRecordings, clearWorkbenchScope } from './workbenchStore'

/**
 * Clears the detail recordings of every account in this browser except the signed-in one (`keepUserId`,
 * or none when nobody is). An account whose session ended while the tab was closed, or that was deleted
 * on another device, is never signed in here again, so nothing else would clear it. Only account scopes
 * are touched: the recordings kept for a signed-out visitor stay. Call it only on a definite answer from
 * the server, never on a network error. Best effort: what storage refuses is tried again at the next load.
 */
export async function sweepAccountDetails(keepUserId: string | null): Promise<void> {
  // An environment without IndexedDB could never have kept these recordings.
  if (typeof indexedDB === 'undefined') return
  try {
    // A visitor who never stored a recording has no database, and looking must not make one.
    if (!(await workbenchExists())) return
    for (const userId of await accountsWithRecordings()) {
      if (userId !== keepUserId) await clearWorkbenchScope({ kind: 'account', userId })
    }
  } catch {
    // The recordings stay until a later load tries again.
  }
}
