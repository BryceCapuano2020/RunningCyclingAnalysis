import { useEffect, useState } from 'react'

/** How long the account lookup may leave the restoring page showing before the landing page takes its place. */
export const RESTORING_BOUND_MS = 3_000

/**
 * Whether the restoring page is shown. A kept library being restored keeps it on screen until the
 * library replies. If the account lookup has not answered within RESTORING_BOUND_MS, the landing
 * page takes its place, since it has Add files and the sample. Once the account has answered, the
 * restoring page stays until the library reply, so the landing page does not flash in between.
 */
export function useRestoringWindow(restoring: boolean, accountLoading: boolean): boolean {
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    if (!restoring || !accountLoading || expired) return
    const timer = setTimeout(() => setExpired(true), RESTORING_BOUND_MS)
    return () => clearTimeout(timer)
  }, [restoring, accountLoading, expired])

  // Once the landing page has shown, it stays: results replace it when the library replies.
  return restoring && !expired
}
