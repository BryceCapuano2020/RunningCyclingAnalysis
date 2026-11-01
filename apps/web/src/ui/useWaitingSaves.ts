import { useEffect, useState } from 'react'
import type { SyncIssue } from '@rca/core/session'
import { waitingCount } from '../worker/outbox'
import type { LibraryStatus, OutboxStatus } from './analysis/model'

export interface WaitingSavesInput {
  /** Who is signed in; nobody's saves wait otherwise. */
  userId: string | undefined
  /** What the worker's resume last said about the outbox, when it has said anything this visit. */
  outbox: OutboxStatus | null
  /** The failures the import left on screen: they say what waits themselves. */
  issues: readonly SyncIssue[]
  /** An import or an update is running; the outbox is read again when it ends. */
  busy: boolean
  libraryStatus: LibraryStatus
}

/**
 * What the outbox holds, as the note and the "Try again now" button need it, straight after a load. The worker's
 * resume only says anything once the library has loaded and a row exists to send, so a reload with the server or the
 * connection still failing would show nothing until a later load. The rows are in this browser, so they are read from
 * it: while the worker has said nothing, the status is made from the count of rows waiting. Returns the worker's own
 * status once it has one.
 */
export function useWaitingSaves({
  userId,
  outbox,
  issues,
  busy,
  libraryStatus,
}: WaitingSavesInput): OutboxStatus | null {
  const [rows, setRows] = useState(0)
  useEffect(() => {
    // While the worker's resume is sending, the rows change under any count; it is read again when that ends.
    if (userId === undefined || busy || libraryStatus === 'loading') return
    if (outbox !== null && !outbox.finished) return
    let current = true
    // A browser that offers no storage holds no rows; a read that fails says nothing.
    waitingCount(userId).then(
      (count) => current && setRows(count),
      () => undefined,
    )
    return () => {
      current = false
    }
  }, [userId, busy, libraryStatus, outbox])
  if (outbox !== null) return outbox
  if (userId === undefined || rows === 0 || issues.length > 0 || libraryStatus === 'loading')
    return null
  return { pending: rows, saved: 0, failed: 0, finished: true }
}
