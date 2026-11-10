import type { SessionState } from '@rca/core/session'
import { fromSnapshot, snapshotIsCurrent } from '@rca/core/stateSnapshot'
import type { StateSnapshot } from '@rca/core/stateSnapshot'
import { getServerSnapshot } from '../../api/state'
import { unsentLifts } from '../../worker/liftCounts'
import { waitingCount } from '../../worker/outbox'
import { settingsUnsent } from '../settingsUnsent'

/** What the server computed, ready to show: the state, and the snapshot it came from. */
export interface ServerCopy {
  snapshot: StateSnapshot
  state: SessionState
}

/**
 * Whether this device holds work the server has not seen: activities in the outbox, lifting sets not sent, a choice not
 * saved to the account. A snapshot is computed without it, so it is not shown over what this device computes
 * (docs/design/server-compute.md, decision 4).
 */
export async function hasUnsentWork(userId: string): Promise<boolean> {
  if (settingsUnsent()) return true
  const [waiting, sets] = await Promise.all([
    waitingCount(userId).catch(() => 0),
    unsentLifts(userId).catch(() => 0),
  ])
  return waiting > 0 || sets > 0
}

/**
 * The server's snapshot of this account's results when this device should show it: `/api/me` said the server computes
 * for the account (`serverState`; for any other account nothing is requested and this is null, so the page behaves as it
 * does without server results), the server has a snapshot, it is this build's shape and model, it decodes, it is newer than
 * the device copy `held` (or there is no copy), and the device holds no unsent work. Never rejects.
 */
export async function newerServerCopy(
  userId: string,
  held: StateSnapshot | null,
  serverState: boolean,
): Promise<ServerCopy | null> {
  if (!serverState) return null
  try {
    if (await hasUnsentWork(userId)) return null
    const snapshot = await getServerSnapshot(userId, held)
    if (snapshot === null || !snapshotIsCurrent(snapshot)) return null
    if (held !== null && snapshot.nowMs <= held.nowMs) return null
    const state = fromSnapshot(snapshot)
    // Work may have been made while the snapshot was on its way.
    if (await hasUnsentWork(userId)) return null
    return { snapshot, state }
  } catch {
    // Off, unreachable or unreadable: the device copy and the live analysis stand, as before.
    return null
  }
}
