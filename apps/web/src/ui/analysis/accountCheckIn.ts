import { useEffect } from 'react'
import type { CheckInSnapshot } from '@rca/core/lookback'
import { checkInOfSnapshot } from '@rca/core/stateSnapshot'
import type { StateSnapshot } from '@rca/core/stateSnapshot'
import { useLatest } from './useLatest'

/**
 * "Since your last import" for an account: the library to compare with is the server's (its snapshot carries the check-in
 * snapshot), and the baseline and what the athlete has seen stay in the worker, so the page hands the first to the second whenever
 * it changes. Asked once the library has loaded (the worker knows the account then), and again when the library is read anew. A
 * snapshot that carries none (a copy from before it did) asks nothing.
 */
export function useAccountCheckIn(
  snapshot: StateSnapshot | null,
  ready: boolean,
  request: (live: CheckInSnapshot | null) => void,
): void {
  // The same check-in in a newer snapshot (an unchanged recompute moves only the instant) is not asked about again.
  const carried = snapshot?.checkIn
  const key = carried === undefined ? null : JSON.stringify(carried)
  const latest = useLatest(snapshot)
  const ask = useLatest(request)
  useEffect(() => {
    const now = latest()
    if (!ready || now === null || key === null) return
    ask()(checkInOfSnapshot(now))
  }, [ready, key, latest, ask])
}
