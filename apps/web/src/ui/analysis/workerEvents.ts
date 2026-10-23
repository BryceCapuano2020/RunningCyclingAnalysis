import { useEffect } from 'react'
import type { SyncIssueCode } from '@rca/core/session'
import { limitReached } from '../limitCopy'
import type { WorkerResponse } from '../../worker/protocol'
import { deleteFailureText, LIBRARY_NOT_LOADED, rebuildNoticeText, workerFailureText } from './copy'
import type { ErrorReply } from './copy'
import type { ImportState } from './importState'
import type { LibraryState } from './libraryState'
import { EMPTY_SESSION } from './model'
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
}

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
        current.imports.setProgress(message.filesRead)
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
  const { transport, imports, library, addFiles, handleAccountIssue, refreshBusy } = deps
  // Replies arrive in request order; the first pending request is the one this answers.
  const pending = transport.pendingRepliesRef.current.shift()
  refreshBusy()
  transport.automaticRestartCountRef.current = 0
  transport.setWorkerStopped(false)
  imports.setProgress(null)
  imports.setUploading(null)
  if (message.type === 'exportReady') {
    pending?.settle?.(message)
    return
  }
  if (pending?.kind === 'exportData') {
    pending.settle?.(message)
    if (message.type === 'error' && message.issue !== undefined) handleAccountIssue(message.issue)
    return
  }
  if (message.type === 'error') {
    handleReplyError(deps, pending, message)
    return
  }
  imports.setState(message.state)
  if (message.type === 'state') {
    if (message.outcome) imports.setImportOutcome(message.outcome)
    if (pending?.kind === 'loadServer') {
      library.setLibrary('loaded')
      // Imports made while the library loaded join it now, in the order they were made.
      for (const files of library.libraryWaitRef.current.splice(0)) addFiles(files)
      refreshBusy()
    }
    if (pending?.kind === 'deleteActivity') library.setLibraryNotice(pending.notice ?? null)
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
  } else if (pending?.kind === 'deleteActivity') {
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
