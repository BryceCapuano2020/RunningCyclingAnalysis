import type { CheckInSnapshot } from '@rca/core/lookback'
import { checkInOfSnapshot, snapshotIsCurrent } from '@rca/core/stateSnapshot'
import { getMe } from '../api/client'
import { readServerState } from '../api/state'
import { readSnapshot } from './stateStore'

/**
 * The "since your last import" snapshot an account's import starts from: the library as the server computed it, read from
 * a fresh `GET /api/state` (the browser builds no state for an account). Null is a library with nothing to compare. While
 * the server is computing (a 202) the snapshot kept on this device (`rca-state`) stands in, when it is this build's and
 * carries a check-in. Anything else (no snapshot, another build, an error) is undefined: no check-in for that import.
 */
export async function accountBaseline(userId: string): Promise<CheckInSnapshot | null | undefined> {
  let read
  try {
    read = await readServerState(userId)
  } catch {
    return undefined
  }
  if (read.kind === 'snapshot') {
    return snapshotIsCurrent(read.snapshot) && read.snapshot.checkIn !== undefined
      ? checkInOfSnapshot(read.snapshot)
      : undefined
  }
  if (read.kind !== 'computing') return undefined
  const copy = await readSnapshot(userId)
  return copy === null || !snapshotIsCurrent(copy) || copy.checkIn === undefined
    ? undefined
    : checkInOfSnapshot(copy)
}

/**
 * The account's library version as it stands now, read before its list of activities so the index is at least this new. Undefined
 * when it cannot be read: the page then takes the next snapshot's version as the index's.
 */
export async function libraryVersionNow(): Promise<number | undefined> {
  try {
    return (await getMe({ retry: false, timeoutMs: 5_000 }))?.libraryVersion
  } catch {
    return undefined
  }
}
