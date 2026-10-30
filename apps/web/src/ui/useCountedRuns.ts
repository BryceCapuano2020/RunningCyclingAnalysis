import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  clearCountedRuns,
  loadCountedRuns,
  MAX_COUNTED_RUNS,
  storeCountedRuns,
  subscribeCountedRuns,
} from './countedRunsStore'
import { plural } from './components/plural'

/** Said when the browser would not keep the choice, so it would be lost at the next reload. */
export const COUNT_NOT_KEPT =
  'This browser would not keep that choice, so it will not last past a reload. Check that it may store site data.'
/** Said when the browser would not forget the choices, so they are still kept. */
export const COUNT_NOT_FORGOTTEN =
  'This browser would not forget the runs you counted, so they are still counted.'
/** Said when a choice would pass the most the app keeps; nothing is counted or dropped silently. */
export const COUNT_TOO_MANY = `You can count up to ${MAX_COUNTED_RUNS.toLocaleString('en-US')} runs at walking pace. These were not counted.`

/** How long a status stays before it is cleared, long enough for a screen reader to have read it. */
export const STATUS_MS = 2000

export interface CountedRunsController {
  /** The workout keys of the runs counted despite their walking pace. The same array until a choice changes. */
  keys: readonly string[]
  /** Counts these runs. The choice applies at once and is kept in this browser; `notKept` says when it was not. */
  count: (workoutKeys: readonly string[]) => void
  /** Goes back to leaving these runs out. */
  stop: (workoutKeys: readonly string[]) => void
  /** Forgets every choice, as signing out does. */
  clear: () => void
  /**
   * Why the last change was not kept (or not made), or null. It stays until the next change, so a refusal that
   * a view's swap would hide is still said where the counted state shows.
   */
  notKept: string | null
  /** What the last change did, for a screen reader: "Counting 22 runs." Kept in a live region that stays mounted. */
  status: string
}

/**
 * The runs the athlete counts as runs although they are at walking pace. A choice is applied at once and
 * stored in this browser; if the browser refuses the store, `notKept` says so and the choice holds for this
 * visit only. The choices are shared with other tabs and with the views that clear them (countedRunsStore).
 */
export function useCountedRuns(): CountedRunsController {
  const [keys, setKeys] = useState<readonly string[]>(loadCountedRuns)
  const [notKept, setNotKept] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  // The store is the truth: a change from another tab, or a clear from the worker's reply, reaches every view.
  useEffect(() => subscribeCountedRuns(() => setKeys(loadCountedRuns())), [])

  // What a change did is said once: it is cleared after it has been announced, so the same words can be said
  // again by a later press.
  useEffect(() => {
    if (status === '') return
    const timer = setTimeout(() => setStatus(''), STATUS_MS)
    return () => clearTimeout(timer)
  }, [status])

  const change = useCallback((next: readonly string[], said: string) => {
    const sorted = [...new Set(next)].sort()
    if (sorted.length > MAX_COUNTED_RUNS) {
      setNotKept(COUNT_TOO_MANY)
      return
    }
    setKeys(sorted)
    setStatus(said)
    setNotKept(storeCountedRuns(sorted) ? null : COUNT_NOT_KEPT)
  }, [])

  const count = useCallback(
    (workoutKeys: readonly string[]) =>
      change([...keys, ...workoutKeys], `Counting ${plural(workoutKeys.length, 'run')}.`),
    [change, keys],
  )
  const stop = useCallback(
    (workoutKeys: readonly string[]) =>
      change(
        keys.filter((held) => !workoutKeys.includes(held)),
        `Leaving ${plural(workoutKeys.length, 'run')} out.`,
      ),
    [change, keys],
  )
  const clear = useCallback(() => {
    const forgotten = clearCountedRuns()
    setNotKept(forgotten ? null : COUNT_NOT_FORGOTTEN)
    // The store tells its subscribers when it was cleared. When the browser refused, the runs are still
    // counted, and the state keeps saying so rather than reading a store that cannot be trusted.
    setStatus('')
  }, [])

  return useMemo(
    () => ({ keys, count, stop, clear, notKept, status }),
    [keys, count, stop, clear, notKept, status],
  )
}
