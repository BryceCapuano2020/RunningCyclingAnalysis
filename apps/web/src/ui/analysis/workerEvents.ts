import { useEffect } from 'react'
import { noteActivity } from './requestWatch'
import { REPLY_TYPES } from '../../worker/protocol'
import type { WireStamp, WorkerResponse } from '../../worker/protocol'
import { STALLED_LEAD, UNREADABLE_LEAD, workerFailureText } from './copy'
import { setDeviceLibraryMarked } from './keptLibrary'
import { noteDeviceList } from './rememberKept'
import { handleReply } from './replyHandlers'
import type { WorkerEventDeps } from './replyHandlers'
import { isStaleDeviceList } from './staleReplies'
import { drainBatches, EMPTY_SESSION } from './model'
import { useLatest } from './useLatest'

/** Messages in a row the browser cannot read back before the worker counts as failed. */
const UNREADABLE_LIMIT = 3

/**
 * Creates the worker and routes its messages. Each reply is attributed to the request it answers,
 * and a message from an earlier worker generation is ignored. The effect runs once per generation:
 * its handlers read the latest callbacks through useLatest, so a callback that changes identity does
 * not replace the worker.
 */
export function useWorkerEvents(deps: WorkerEventDeps): void {
  const { workerGeneration } = deps.transport
  const latest = useLatest(deps)

  useEffect(() => {
    const generation = workerGeneration
    const { transport, previousStatusRef, previousUserIdRef } = latest()
    const { workerRef } = transport
    const worker = new Worker(new URL('../../worker/analysis.worker.ts', import.meta.url), {
      type: 'module',
    })
    let unreadableInARow = 0
    worker.onmessage = (event: MessageEvent<WorkerResponse & WireStamp>) => {
      const current = latest()
      if (generation !== current.transport.workerGenerationRef.current) return
      unreadableInARow = 0
      const message = event.data
      // A message belongs to the request it answers (a reply) or ran under (an event). One that names a
      // request the page no longer waits for is stray: late, repeated or from before a clear. A reply
      // that names no request cannot be matched to one at all.
      const owner = message.replyTo ?? message.during
      const { pendingRepliesRef, strayRepliesRef } = current.transport
      const pending =
        owner === undefined ? undefined : pendingRepliesRef.current.find(({ id }) => id === owner)
      const { lastHeardAtRef, releasedRef } = current.transport
      const released = owner === undefined ? undefined : releasedRef.current.get(owner)
      if (pending === undefined && message.type === 'heartbeat') {
        // A beat for a request the page let go is the worker still busy with it. It counts as hearing
        // from the worker only if the work moved: a read that hangs while beating must not keep a
        // request queued behind it from being judged not started.
        if (released !== undefined && message.progress !== released.progress) {
          released.progress = message.progress
          lastHeardAtRef.current = Date.now()
        }
        return
      }
      lastHeardAtRef.current = Date.now()
      if (released !== undefined && REPLY_TYPES.has(message.type))
        releasedRef.current.delete(owner!)
      if (pending === undefined && message.type === 'started') return
      if (
        (owner !== undefined && pending === undefined) ||
        (owner === undefined && REPLY_TYPES.has(message.type))
      ) {
        strayRepliesRef.current++
        return
      }
      if (pending !== undefined) noteActivity(pending, message)
      if (message.type === 'started' || message.type === 'heartbeat') return
      if (message.type === 'progress') {
        current.imports.setProgress({
          filesRead: message.filesRead,
          filesTotal: message.filesTotal ?? null,
          ...(message.paused ? { paused: true as const } : {}),
        })
        current.imports.setUploading(message.uploaded ?? null)
        // A new import has begun, so the last one's count no longer stands.
        current.imports.setSavedCount(null)
        return
      }
      if (message.type === 'missingOriginals') {
        current.library.setMissingOriginals(message.count)
        return
      }
      if (message.type === 'detailCoverage') {
        // Unknown when storage could not say, so no activity is called detail-less on an old answer.
        current.library.setDetail(
          message.ids === null
            ? null
            : { ids: new Set(message.ids), oldestStartMs: message.oldestStartMs },
        )
        return
      }
      if (message.type === 'libraryActivities') {
        if (isStaleDeviceList(current.transport, current.accountRef, message.during)) return
        // Also read at once by rememberKeptLibrary, ahead of the render that sets the state.
        current.library.savedActivitiesRef.current = message.activities
        current.library.setSavedActivities(message.activities)
        // Signed in, a list is the account's; signed out, or while that is not known, it is this browser's.
        if (current.accountRef.current.status !== 'signed-in') {
          noteDeviceList(current.library, message.activities, message.skipped ?? 0, pending)
        }
        return
      }
      if (message.type === 'deviceHolds') {
        setDeviceLibraryMarked(message.holds)
        return
      }
      if (message.type === 'libraryUnreadable') {
        current.library.setLibraryUnreadable(message.count)
        return
      }
      if (message.type === 'deviceIssue') {
        // A refusal to keep follows the import's failure to read what was kept: both are said, not the last alone.
        current.library.setDeviceIssue((previous) =>
          message.issue === 'notSaved'
            ? {
                issue: 'notSaved',
                count: message.count,
                ...(message.newer === undefined ? {} : { newer: message.newer }),
                ...(previous?.issue === 'notRead' ? { unread: true as const } : {}),
              }
            : { issue: message.issue },
        )
        return
      }
      if (message.type === 'accountIssue') {
        current.handleAccountIssue(message.issue)
        return
      }
      // A reply always has its request: the check above dropped any that did not.
      if (pending !== undefined) handleReply(current, message, pending)
    }
    worker.onerror = (event) => {
      const current = latest()
      if (generation !== current.transport.workerGenerationRef.current) return
      handleWorkerFailure(current, worker, event.message)
    }
    // A message the browser could not read back is one the page cannot match to a request. Counted, and
    // the request it answered is left to the watchdog.
    worker.onmessageerror = () => {
      const current = latest()
      if (generation !== current.transport.workerGenerationRef.current) return
      current.transport.strayRepliesRef.current++
      // One unreadable message is lost news; three in a row is a worker that cannot be understood.
      if (++unreadableInARow >= UNREADABLE_LIMIT) failWorker(current, worker, UNREADABLE_LEAD)
    }
    workerRef.current = worker
    // A new worker is heard from the moment it exists, so its first requests are not judged by a dead one's silence.
    transport.lastHeardAtRef.current = Date.now()
    transport.releasedRef.current.clear()
    // A worker that starts while nobody is signed in begins from the library kept in this browser.
    // One that starts signed in never does, so the device library cannot replace an account's.
    const current = latest()
    current.deviceLoadedRef.current = false
    current.loadDeviceOnce()
    transport.flushUnsent()
    return () => {
      worker.terminate()
      workerRef.current = null
      transport.dropPendingReplies()
      // In React StrictMode, effects are cleaned up and set up again on mount. The first
      // worker is terminated, so its initial account-load request must be sent to the new one.
      previousStatusRef.current = 'loading'
      previousUserIdRef.current = null
    }
  }, [workerGeneration, latest])
}

/**
 * The worker stopped on its own. It is replaced once automatically. A second failure stops it for
 * good until the user asks for a retry, so a broken module or browser resource cannot trigger an
 * unbounded restart loop.
 */
function handleWorkerFailure(
  deps: WorkerEventDeps,
  worker: Worker,
  eventMessage: string,
  lead?: string,
): void {
  const { transport, imports, library, accountRef, setError, failLibrary, refreshBusy } = deps
  transport.dropPendingReplies()
  refreshBusy()
  imports.setProgress(null)
  imports.setUploading(null)
  const current = accountRef.current
  if (current.status !== 'signed-in') imports.setState(EMPTY_SESSION)
  imports.setImportOutcome(null)
  const willRestart = transport.automaticRestartCountRef.current < 1
  setError(workerFailureText(current.status, willRestart, eventMessage, lead))
  if (willRestart) {
    transport.automaticRestartCountRef.current += 1
    transport.restartWorker()
  } else {
    worker.terminate()
    transport.workerRef.current = null
    transport.stoppedRef.current = true
    transport.setWorkerStopped(true)
    // A worker that stays down cannot restore the kept library, so the restoring state ends.
    library.setRestoring(false)
    // Imports waiting for a library the worker can no longer read are dropped, so the page is not busy.
    drainBatches(library.libraryWaitRef)
    refreshBusy()
    if (current.status === 'signed-in') failLibrary()
  }
}

/**
 * The worker is running but has made no headway for longer than its request allows (see requestWatch).
 * It is treated as a worker that stopped on its own: replaced once, then stopped for good. The request
 * that stalled is not sent again; an import resumes from what was saved, as after any restart.
 */
export function failStalledWorker(deps: WorkerEventDeps): void {
  const worker = deps.transport.workerRef.current
  if (worker !== null) failWorker(deps, worker, STALLED_LEAD)
}

/** The worker is replaced for a reason of ours rather than its own error event. */
function failWorker(deps: WorkerEventDeps, worker: Worker, lead: string): void {
  handleWorkerFailure(deps, worker, '', lead)
}
