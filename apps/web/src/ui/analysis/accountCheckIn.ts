import { useEffect, useRef, useState } from 'react'
import type { CheckInSnapshot } from '@rca/core/lookback'
import { checkInOfSnapshot } from '@rca/core/stateSnapshot'
import type { StateSnapshot } from '@rca/core/stateSnapshot'
import type { CheckInView } from '../../worker/protocol'
import { useLatest } from './useLatest'

/**
 * "Since your last import" for an account: the library to compare with is the server's (its snapshot carries the check-in
 * snapshot), and the baseline and what the athlete has seen stay in the worker, so the page hands the first to the second whenever
 * it changes. Asked once the library has loaded (the worker knows the account then), and again when the library is read anew. A
 * snapshot that carries none (a copy from before it did) asks nothing.
 *
 * Returns the library version of the snapshot the row on screen was answered for (null before any), so what an import moved can wait
 * for the row that goes with its results, and `again`, which asks about the snapshot on screen once more.
 */
export function useAccountCheckIn(
  snapshot: StateSnapshot | null,
  ready: boolean,
  request: (live: CheckInSnapshot | null, settle: (view: CheckInView) => void) => void,
  show: (view: CheckInView) => void,
): { version: () => number | null; again: () => void } {
  // The same check-in in a newer snapshot (an unchanged recompute moves only the instant) is not asked about again.
  const carried = snapshot?.checkIn
  const key = carried === undefined ? null : JSON.stringify(carried)
  const latest = useLatest(snapshot)
  const ask = useLatest(request)
  const showView = useLatest(show)
  const answered = useRef<number | null>(null)
  // Bumped to ask again about the snapshot on screen when its check-in has not changed but the baseline it is compared with has.
  const [again, setAgain] = useState(0)
  const generation = useRef(0)
  useEffect(() => {
    // Each bump of `again` is a new ask, though nothing else changed.
    generation.current = again
    const now = latest()
    if (!ready || now === null || key === null) return
    const version = now.libraryVersion
    ask()(checkInOfSnapshot(now), (view) => {
      answered.current = version
      showView()(view)
    })
  }, [ready, key, again, latest, ask, showView])
  return { version: () => answered.current, again: () => setAgain((count) => count + 1) }
}
