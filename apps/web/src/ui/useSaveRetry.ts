import { useCallback, useEffect, useRef } from 'react'
import { isTransient } from '@rca/core/session'
import type { SyncIssue } from '@rca/core/session'
import type { LibraryStatus, OutboxStatus } from './analysis/model'

/** Whether any failure in `issues` is one that sending again can clear. */
export function hasRetryableIssue(issues: readonly SyncIssue[]): boolean {
  return issues.some(({ code }) => isTransient(code))
}

/** An `online` this soon after a retry is ignored: browsers send a burst of them as a flaky link comes and goes. */
const ONLINE_FLOOR_MS = 10_000

export interface SaveRetryInput {
  signedIn: boolean
  issues: readonly SyncIssue[]
  /** What the outbox is doing: rows it has not saved and means to try again. */
  outbox: OutboxStatus | null
  /** An import is running: it is reading the library a retry would touch, so a retry waits. */
  busy: boolean
  /** The library is being read: its load runs the outbox itself, so a retry waits for it. */
  libraryStatus: LibraryStatus
  /** Sends the saves the outbox holds now (the worker's writer resume), without reading the library again. */
  resume: () => void
  /** The clock, a seam for tests. */
  now?: () => number
}

/**
 * Sending what failed to save again. The outbox already holds each activity that did not reach the account; a
 * retry asks the worker to send them now, in the one tab that holds the account's writer lock, so there is one
 * sender. It runs when the browser comes back online while saves wait (at most once in 10 s), and for the
 * visitor's own "Try again now". Returns whether saves wait, and the retry.
 */
export function useSaveRetry({
  signedIn,
  issues,
  outbox,
  busy,
  libraryStatus,
  resume,
  now = Date.now,
}: SaveRetryInput) {
  const running = outbox !== null && !outbox.finished
  const waiting =
    signedIn &&
    (hasRetryableIssue(issues) || (outbox !== null && outbox.finished && outbox.pending > 0))
  const latest = useRef({ blocked: false, resume, now })
  const lastAt = useRef(-Infinity)
  useEffect(() => {
    latest.current = { blocked: busy || running || libraryStatus === 'loading', resume, now }
  })
  const retry = useCallback(() => {
    if (latest.current.blocked) return
    lastAt.current = latest.current.now()
    latest.current.resume()
  }, [])
  useEffect(() => {
    if (!waiting) return
    const onOnline = () => {
      if (latest.current.now() - lastAt.current >= ONLINE_FLOOR_MS) retry()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [waiting, retry])
  return { waiting, retry }
}
