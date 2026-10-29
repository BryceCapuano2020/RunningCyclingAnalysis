import { useEffect } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { SessionState, SyncIssueCode } from '@rca/core/session'
import { limitReached } from '../limitCopy'
import type { WorkerResponse } from '../../worker/protocol'
import {
  DEVICE_NOT_LOADED,
  deleteFailureText,
  LIBRARY_NOT_LOADED,
  rebuildNoticeText,
  workerFailureText,
} from './copy'
import type { ErrorReply } from './copy'
import { setKeptLibraryHinted } from './keptLibrary'
import { baselineOf } from './importState'
import { mergeOutcomes } from './mergeOutcomes'
import { isOvertaken, isStaleDeviceList } from './staleReplies'
import type { ImportState } from './importState'
import type { LibraryState } from './libraryState'
import { drainBatches, EMPTY_SESSION, isDeletion } from './model'
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
  addFiles: (files: File[], baseline?: AnalysisResult | null) => void
  handleAccountIssue: (issue: SyncIssueCode) => void
  accountRef: Box<Account>
  previousStatusRef: Box<Account['status']>
  previousUserIdRef: Box<string | null>
  /** Whether the current worker has been asked for the library kept in this browser. */
  deviceLoadedRef: Box<boolean>
  loadDeviceOnce: () => void
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
      | 'progress'
      | 'missingOriginals'
      | 'detailCoverage'
      | 'libraryActivities'
      | 'libraryUnreadable'
      | 'accountIssue'
      | 'deviceIssue'
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
        current.library.setDetail({
          ids: new Set(message.ids),
          oldestStartMs: message.oldestStartMs,
        })
        return
      }
      if (message.type === 'libraryActivities') {
        if (isStaleDeviceList(current.transport, current.accountRef)) return
        // Also read at once by rememberKeptLibrary, ahead of the render that sets the state.
        current.library.savedActivitiesRef.current = message.activities
        current.library.setSavedActivities(message.activities)
        return
      }
      if (message.type === 'libraryUnreadable') {
        current.library.setLibraryUnreadable(message.count)
        return
      }
      if (message.type === 'deviceIssue') {
        current.library.setDeviceIssue(
          message.issue === 'notSaved'
            ? {
                issue: 'notSaved',
                count: message.count,
                ...(message.newer === undefined ? {} : { newer: message.newer }),
              }
            : { issue: 'notForgotten' },
        )
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

/**
 * A library read that answers or fails ends the restoring state. The hint says whether this browser
 * has results to restore: a library read or a saved import sets it, a clear or an empty library clears it.
 * For the library kept in this browser it follows the list the worker reported from storage, not the
 * session, so a refused save or a refused clear leaves the hint as storage stands.
 */
function rememberKeptLibrary(
  library: LibraryState,
  pending: Pending | undefined,
  message: ReplyResponse,
): void {
  if (pending?.kind === 'loadDevice' || pending?.kind === 'loadServer') library.setRestoring(false)
  if (pending === undefined || message.type !== 'state') return
  const kept = library.savedActivitiesRef.current.length > 0
  // A clear keeps the library kept in this browser unless it forgets it, as a signed-in clear does not.
  if (pending.kind === 'clear') {
    if (pending.forgetDevice === true) setKeptLibraryHinted(kept)
    return
  }
  // A sample on screen says nothing about the library kept in this browser.
  if (message.state.isSample) return
  if (pending.kind === 'loadServer') setKeptLibraryHinted(message.state.library.length > 0)
  else if (
    pending.kind === 'loadDevice' ||
    pending.kind === 'deleteDeviceActivity' ||
    pending.kind === 'keepProvisional' ||
    (pending.kind === 'addFiles' && pending.saveToDevice === true)
  ) {
    setKeptLibraryHinted(kept)
  }
}

/**
 * Adds the imports that waited for a library to load, in the order they were made. Each is compared
 * with the library this reply leaves, the result the page shows once it renders, and keeps that
 * baseline when it is sent.
 */
function addWaiting(deps: WorkerEventDeps, state: SessionState): void {
  const { library, addFiles, refreshBusy } = deps
  for (const files of drainBatches(library.libraryWaitRef)) addFiles(files, baselineOf(state))
  refreshBusy()
}

/**
 * Settles a library read that a Start over overtook. A signed-in library it loaded still counts:
 * imports made after the clear wait for it, and are saved to it, compared with the empty session the
 * clear leaves. A device read's answer is not shown at all.
 */
function settleOvertaken(deps: WorkerEventDeps, pending: Pending, message: ReplyResponse): void {
  if (pending.kind !== 'loadServer') return
  if (message.type === 'error') {
    handleReplyError(deps, pending, message)
    return
  }
  if (message.type === 'state') {
    deps.library.setLibrary('loaded')
    addWaiting(deps, EMPTY_SESSION)
  }
}

/** Shows what a reply reports, and settles the request it answers. */
function handleReply(deps: WorkerEventDeps, message: ReplyResponse): void {
  const { transport, imports, library, handleAccountIssue, refreshBusy } = deps
  // A route reply answers only a route request. One that comes out of turn is dropped before the
  // pending request is taken, so that request still gets its own reply.
  const front = transport.pendingRepliesRef.current[0]
  if (message.type === 'routeShape' && (front === undefined || !ROUTE_KINDS.has(front.kind))) return
  if (message.type === 'activityTrace' && front?.kind !== 'activityTrace') return
  // Replies arrive in request order; the first pending request is the one this answers.
  const pending = transport.pendingRepliesRef.current.shift()
  // A period pick is answered by its own reply, which the page counts; its state is applied below as usual.
  if (pending?.kind === 'setRange') pending.settle?.(message)
  refreshBusy()
  // The session was cleared after this request was sent, so its answer must not refill the page.
  if (pending?.ignored) return
  transport.automaticRestartCountRef.current = 0
  transport.setWorkerStopped(false)
  imports.setProgress(null)
  imports.setUploading(null)
  if (pending !== undefined && isOvertaken(transport, pending)) {
    settleOvertaken(deps, pending, message)
    return
  }
  rememberKeptLibrary(library, pending, message)
  if (message.type === 'activityTrace' || pending?.kind === 'activityTrace') {
    pending?.settle?.(message)
    if (message.type === 'error' && message.issue !== undefined) handleAccountIssue(message.issue)
    return
  }
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
  // A rebuild replaces the session, and with it the files the last import skipped, so its summary goes.
  if (pending?.kind === 'rebuildStale') imports.setImportOutcome(null)
  imports.setState(message.state)
  // Set with the state, in one update, so the notice never counts one against the other's old value.
  library.setOutdatedWithOriginal(message.outdatedWithOriginal ?? 0)
  if (message.type === 'state') {
    imports.setSavedCount(message.saved ?? null)
    noteProvisionalOutcome(imports, pending, message)
    // An analysis made while the account loads is shown, but only the import that is saved is summarised.
    if (message.outcome && !pending?.provisional) {
      imports.setImportOutcome(message.outcome)
      imports.setImportChange({
        outcome: message.outcome,
        before: pending?.baseline ?? null,
        after: message.state.result,
      })
    }
    if (pending?.kind === 'loadServer') {
      library.setLibrary('loaded')
      // Imports made while the library loaded join it now, in the order they were made.
      addWaiting(deps, message.state)
    }
    // Imports made while the kept library loaded are saved once it has, each compared with it.
    if (pending?.kind === 'loadDevice') addWaiting(deps, message.state)
    if (pending && isDeletion(pending.kind)) library.setLibraryNotice(pending.notice ?? null)
    return
  }
  imports.setRebuildNotice(rebuildNoticeText(message))
}

/**
 * Adds up what provisional imports reported, which is not shown while the account is unknown, so the
 * summary can say it once they are kept as they are. A library read or a clear starts the count again,
 * since the files are analysed anew after it.
 */
function noteProvisionalOutcome(
  imports: WorkerEventDeps['imports'],
  pending: Pending | undefined,
  message: Extract<ReplyResponse, { type: 'state' }>,
): void {
  const { provisionalOutcomeRef: held } = imports
  if (pending?.provisional && message.outcome) {
    held.current =
      held.current === null ? message.outcome : mergeOutcomes(held.current, message.outcome)
  } else if (pending?.kind === 'keepProvisional' && held.current !== null) {
    imports.setImportOutcome(held.current)
    imports.setImportChange({ outcome: held.current, before: null, after: message.state.result })
    held.current = null
  } else if (['loadDevice', 'loadServer', 'clear', 'loadSample'].includes(pending?.kind ?? '')) {
    held.current = null
  }
}

/** Says why a request failed, in the place the request's kind calls for. */
function handleReplyError(
  deps: WorkerEventDeps,
  pending: Pending | undefined,
  message: ErrorReply,
): void {
  const { library, setError, failLibrary, handleAccountIssue, refreshBusy } = deps
  if (pending?.kind === 'setRange') pending.settle?.(null)
  if (pending?.kind === 'loadServer') {
    const dropped = failLibrary()
    if (message.issue === 'daily-limit') setError(limitReached('read'), 'daily-limit')
    else if (dropped) setError(LIBRARY_NOT_LOADED)
  } else if (pending?.kind === 'loadDevice') {
    // The kept results in this browser did not load, so the imports waiting for them are dropped.
    const dropped = drainBatches(library.libraryWaitRef).length > 0
    refreshBusy()
    setError(dropped ? DEVICE_NOT_LOADED : message.message)
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
  const { transport, imports, library, accountRef, setError, failLibrary, refreshBusy } = deps
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
    // A worker that stays down cannot restore the kept library, so the restoring state ends.
    library.setRestoring(false)
    // Imports waiting for a library the worker can no longer read are dropped, so the page is not busy.
    drainBatches(library.libraryWaitRef)
    refreshBusy()
    if (current.status === 'signed-in') failLibrary()
  }
}
