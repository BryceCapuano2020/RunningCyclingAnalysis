import type { CheckInSnapshot } from '@rca/core/lookback'
import { checkInOfSnapshot, snapshotIsCurrent } from '@rca/core/stateSnapshot'
import { readServerState } from '../api/state'
import { readSnapshot } from './stateStore'

/**
 * The "since your last import" snapshot of an account's library as the server computed it, read from a fresh
 * `GET /api/state` (the browser builds no state for an account). Null is a library with nothing to compare. Undefined is no
 * answer: the server is computing (202), has none, or cannot be reached.
 *
 * `orDeviceCopy` is for the baseline an import starts from, which may be a little older than the library: on no answer the
 * snapshot kept on this device (`rca-state`) stands in. The check-in of the library an import has just changed never
 * uses it, since the copy is of the library before the import.
 */
export async function accountCheckIn(
  userId: string,
  orDeviceCopy: boolean,
): Promise<CheckInSnapshot | null | undefined> {
  try {
    const read = await readServerState(userId)
    if (
      read.kind === 'snapshot' &&
      snapshotIsCurrent(read.snapshot) &&
      read.snapshot.checkIn !== undefined
    ) {
      return checkInOfSnapshot(read.snapshot)
    }
  } catch {
    // Off or unreachable: no answer, as for a 202.
  }
  if (!orDeviceCopy) return undefined
  const copy = await readSnapshot(userId)
  return copy === null || copy.checkIn === undefined ? undefined : checkInOfSnapshot(copy)
}
