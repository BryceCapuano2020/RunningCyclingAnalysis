import { useCallback, useEffect, useRef } from 'react'
import type { SyncIssue, SyncIssueCode } from '@rca/core/session'
import type { OutboxStatus } from './analysis/model'

/** The save failures that clear by themselves: the connection, or a server that had a bad moment. */
const RETRYABLE = new Set<SyncIssueCode>(['network', 'server'])

/** Whether any failure in `issues` is one that sending again can clear. */
export function hasRetryableIssue(issues: readonly SyncIssue[]): boolean {
  return issues.some(({ code }) => RETRYABLE.has(code))
}

export interface SaveRetryInput {
  signedIn: boolean
  issues: readonly SyncIssue[]
  /** What the outbox is doing: rows it has not saved and means to try again. */
  outbox: OutboxStatus | null
  /** An import is running: it is reading the library a retry would read again, so a retry waits. */
  busy: boolean
  /** Reads the account's library again, which finishes the saves the outbox holds (the worker's writer resume). */
  reload: () => void
}

/**
 * Sending what failed to save again. The outbox already holds each activity that did not reach the account and
 * sends it on the next library load, in the one tab that holds the account's writer lock; a retry is that load,
 * so there is one sender. It runs when the browser comes back online while saves wait, and for the visitor's
 * own "Try again now". Returns whether saves wait, and the retry.
 */
export function useSaveRetry({ signedIn, issues, outbox, busy, reload }: SaveRetryInput) {
  const waiting =
    signedIn &&
    (hasRetryableIssue(issues) || (outbox !== null && outbox.finished && outbox.pending > 0))
  const latest = useRef({ busy, reload })
  useEffect(() => {
    latest.current = { busy, reload }
  })
  const retry = useCallback(() => {
    if (!latest.current.busy) latest.current.reload()
  }, [])
  useEffect(() => {
    if (!waiting) return
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [waiting, retry])
  return { waiting, retry }
}
