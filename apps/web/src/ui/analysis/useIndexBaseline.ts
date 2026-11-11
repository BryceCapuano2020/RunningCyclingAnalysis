import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The library version the worker's index was listed at, which the server's current answers are compared with: a library version past
 * it is a change this tab has not read, another device's or this tab's own, and the index is read again (`onBehind`).
 *
 * Only a current answer says what the library is: the stored snapshot the server serves while it computes covers an older version, and
 * taking it for the baseline would make an import look like another device's change when the current one follows. The baseline is
 * null until a current answer sets it (after this tab's own work notes the index current, which names no version) and is dropped
 * again when a re-read is asked for. Every account has its own: the version listed for another one is no baseline.
 */
export function useIndexBaseline(userId: string | null, onBehind: () => void) {
  const at = useRef<number | null>(null)
  const [listedAt, setListedAt] = useState<{ id: string; version: number | null } | null>(null)
  const behind = useRef(onBehind)
  useEffect(() => {
    behind.current = onBehind
  }, [onBehind])

  /** A current answer at `version`: the baseline when there is none, a re-read when it is past the baseline. */
  const check = useCallback((version: number, current: boolean) => {
    if (!current) return
    const listed = at.current
    if (listed === null) at.current = version
    else if (version > listed) {
      at.current = null
      behind.current()
    }
  }, [])

  /** The index was read at `version` (the library's, before the list was read), or kept current by this tab's own work (none). */
  const note = useCallback(
    (version?: number) => {
      at.current = version ?? null
      if (userId !== null) setListedAt({ id: userId, version: version ?? null })
    },
    [userId],
  )

  /** Another account, or none: nothing is listed. */
  const reset = useCallback(() => {
    at.current = null
  }, [])

  const listedVersion = listedAt !== null && listedAt.id === userId ? listedAt.version : null
  return { check, note, reset, listedVersion }
}
