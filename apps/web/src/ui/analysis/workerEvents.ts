import { useEffect } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { SyncIssueCode } from '@rca/core/session'
import { limitReached } from '../limitCopy'
import type { WorkerResponse } from '../../worker/protocol'
import { deleteFailureText, LIBRARY_NOT_LOADED, rebuildNoticeText, workerFailureText } from './copy'
import type { ErrorReply } from './copy'
import type { ImportState } from './importState'
import type { LibraryState } from './libraryState'
import { EMPTY_SESSION, isDeletion } from './model'
import type { Account, Box, Pending, SetError } from './model'
import { useLatest } from './useLatest'
import type { WorkerTransport } from './workerTransport'

interface WorkerEventDeps {
  transport: WorkerTransport
  imports: ImportState
  library: LibraryState
  setError: SetError
  refreshBusy: () => void
  failLibrary: () => boolean
  addFiles: (files: File[]) => void
  handleAccountIssue: (issue: SyncIssueCode) => void
  accountRef: Box<Account>
  previousStatusRef: Box<Account['status']>
  previousUserIdRef: Box<string | null>
  /** Whether the current worker has been asked for the library kept in this browser. */
  deviceLoadedRef: Box<boolean>
  loadDeviceOnce: () => void
  /** The analysis an import is compared with, taken when the import was sent. */
  baselineRef: Box<AnalysisResult | null>
}

/** The requests a route reply answers. A forgotten route is answered with the same reply. */
const ROUTE_KINDS: ReadonlySet<Pending['kind']> = new Set<Pending['kind']>([
  'routeShape',
  'forgetRoutes',
])

/** The responses that answer a request, as opposed to ones the worker sends on its own. */
type ReplyResponse = Exclude<
  WorkerResponse,
  {
    type:
      'progress' | 'missingOriginals' | 'libraryActivities' | 'libraryUnreadable' | 'accountIssue'
  }
>

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
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const current = latest()
      if (generation !== current.transport.workerGenerationRef.current) return
      const message = event.data
      if (message.type === 'progress') {
        current.imports.setProgress({
          filesRead: message.filesRead,
          filesTotal: message.filesTotal ?? null,
        })
        current.imports.setUploading(message.uploaded ?? null)
        return
      }
      if (message.type === 'missingOriginals') {
        current.library.setMissingOriginals(message.count)
        return
      }
      if (message.type === 'libraryActivities') {
        current.library.setSavedActivities(message.activities)
        return
      }
      if (message.type === 'libraryUnreadable') {
        current.library.setLibraryUnreadable(message.count)
        return
      }
      if (message.type === 'accountIssue') {
        current.handleAccountIssue(message.issue)
        return
      }
      handleReply(current, message)
    }
    worker.onerror = (event) => {
      const current = latest()
      if (generation !== current.transport.workerGenerationRef.current) return
      handleWorkerError(current, worker, event)
    }
    workerRef.current = worker
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

/** Shows what a reply reports, and settles the request it answers. */
function handleReply(deps: WorkerEventDeps, message: ReplyResponse): void {
  const { transport, imports, library, addFiles, handleAccountIssue, refreshBusy, baselineRef } =
    deps
  // A route reply answers only a route request. One that comes out of turn is dropped before the
  // pending request is taken, so that request still gets its own reply.
  const front = transport.pendingRepliesRef.current[0]
  if (message.type === 'routeShape' && (front === undefined || !ROUTE_KINDS.has(front.kind))) return
  // Replies arrive in request order; the first pending request is the one this answers.
  const pending = transport.pendingRepliesRef.current.shift()
  refreshBusy()
  transport.automaticRestartCountRef.current = 0
  transport.setWorkerStopped(false)
  imports.setProgress(null)
  imports.setUploading(null)
  if (message.type === 'exportReady' || message.type === 'routeShape') {
    pending?.settle?.(message)
    return
  }
  if (pending?.kind === 'exportData' || pending?.kind === 'routeShape') {
    pending.settle?.(message)
    if (message.type === 'error' && message.issue !== undefined) handleAccountIssue(message.issue)
    return
  }
  // A splits reply, or the error that answers a splits request, settles that request alone.
  if (message.type === 'splits' || pending?.kind === 'activitySplits') {
    pending?.settle?.(message)
    return
  }
  if (message.type === 'error') {
    handleReplyError(deps, pending, message)
    return
  }
  imports.setState(message.state)
  if (message.type === 'state') {
    if (message.outcome) {
      imports.setImportOutcome(message.outcome)
      imports.setImportChange({
        outcome: message.outcome,
        before: baselineRef.current,
        after: message.state.result,
      })
    }
    if (pending?.kind === 'loadServer') {
      library.setLibrary('loaded')
      // Imports made while the library loaded join it now, in the order they were made.
      for (const files of library.libraryWaitRef.current.splice(0)) addFiles(files)
      refreshBusy()
    }
    if (pending && isDeletion(pending.kind)) library.setLibraryNotice(pending.notice ?? null)
    return
  }
  imports.setRebuildNotice(rebuildNoticeText(message))
}

/** Says why a request failed, in the place the request's kind calls for. */
function handleReplyError(
  deps: WorkerEventDeps,
  pending: Pending | undefined,
  message: ErrorReply,
): void {
  const { library, setError, failLibrary, handleAccountIssue } = deps
  if (pending?.kind === 'loadServer') {
    const dropped = failLibrary()
    if (message.issue === 'daily-limit') setError(limitReached('read'), 'daily-limit')
    else if (dropped) setError(LIBRARY_NOT_LOADED)
  } else if (pending && isDeletion(pending.kind)) {
    library.setLibraryError(deleteFailureText(message))
  } else if (message.issue === 'daily-limit') {
    // A rebuild fails outright only when its first library listing is refused.
    setError(
      pending?.kind === 'rebuildStale' ? limitReached('read') : limitReached('activityCreate'),
      'daily-limit',
    )
  } else setError(message.message)
  if (message.issue !== undefined) handleAccountIssue(message.issue)
}

/**
 * The worker stopped on its own. It is replaced once automatically. A second failure stops it for
 * good until the user asks for a retry, so a broken module or browser resource cannot trigger an
 * unbounded restart loop.
 */
function handleWorkerError(deps: WorkerEventDeps, worker: Worker, event: ErrorEvent): void {
  const { transport, imports, accountRef, setError, failLibrary, refreshBusy } = deps
  transport.dropPendingReplies()
  refreshBusy()
  imports.setProgress(null)
  imports.setUploading(null)
  const current = accountRef.current
  if (current.status !== 'signed-in') imports.setState(EMPTY_SESSION)
  imports.setImportOutcome(null)
  const willRestart = transport.automaticRestartCountRef.current < 1
  setError(workerFailureText(current.status, willRestart, event.message))
  if (willRestart) {
    transport.automaticRestartCountRef.current += 1
    transport.restartWorker()
  } else {
    worker.terminate()
    transport.workerRef.current = null
    transport.stoppedRef.current = true
    transport.setWorkerStopped(true)
    if (current.status === 'signed-in') failLibrary()
  }
}
