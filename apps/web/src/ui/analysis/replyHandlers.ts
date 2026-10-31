import type { SessionState, SyncIssueCode } from '@rca/core/session'
import { limitReached, listingLimitReached } from '../limitCopy'
import { DEVICE_NOT_LOADED, deleteFailureText, LIBRARY_NOT_LOADED, rebuildNoticeText } from './copy'
import type { ErrorReply } from './copy'
import { rememberKeptLibrary } from './rememberKept'
import type { ReplyResponse } from './rememberKept'
import { baselineOf, comparableBefore } from './importState'
import { mergeOutcomes } from './mergeOutcomes'
import { isOvertaken } from './staleReplies'
import type { ImportState } from './importState'
import type { LibraryState } from './libraryState'
import { drainBatches, EMPTY_SESSION, isDeletion } from './model'
import type { Account, Baseline, Box, Pending, SetError } from './model'
import type { WorkerTransport } from './workerTransport'
import type { ImportManifestController } from './importManifestHook'
import type { RejectedFile } from '@rca/core/session'
import type { DamagedSource } from '../importManifest'

export interface WorkerEventDeps {
  transport: WorkerTransport
  imports: ImportState
  library: LibraryState
  setError: SetError
  refreshBusy: () => void
  failLibrary: () => boolean
  addFiles: (files: File[], baseline?: Baseline | null) => void
  handleAccountIssue: (issue: SyncIssueCode) => void
  accountRef: Box<Account>
  previousStatusRef: Box<Account['status']>
  previousUserIdRef: Box<string | null>
  /** Whether the current worker has been asked for the library kept in this browser. */
  deviceLoadedRef: Box<boolean>
  loadDeviceOnce: () => void
  /** The record of imports (see importManifest.ts): how far the running one got, and how it ended. */
  manifest: Pick<ImportManifestController, 'progress' | 'finish' | 'fail'>
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

/** The zips among the refused files that could not be read to their end, with the files that cost, when known. */
export function damagedZips(rejected: readonly RejectedFile[]): DamagedSource[] {
  return rejected
    .filter(({ code, fileName }) => code === 'corrupt' && /\.zip$/i.test(fileName))
    .map(({ fileName, detail }) => {
      const lost = Number(detail)
      return { name: fileName, lost: Number.isInteger(lost) && lost >= 1 ? lost : null }
    })
}

/** Shows what a reply reports, and settles the request it answers. */
export function handleReply(deps: WorkerEventDeps, message: ReplyResponse, pending: Pending): void {
  const { transport, imports, library, handleAccountIssue, refreshBusy } = deps
  // The reply names its request, so it settles that request whatever order replies arrive in.
  const waiting = transport.pendingRepliesRef.current
  waiting.splice(waiting.indexOf(pending), 1)
  if (pending.kind === 'addFiles' && pending.provisional !== true) {
    if (message.type === 'state')
      deps.manifest.finish(pending.id, damagedZips(message.state.rejected))
    else if (message.type === 'error') deps.manifest.fail(pending.id)
  }
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
        before: comparableBefore(pending?.baseline, message.state),
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
    if (message.issue === 'daily-limit') {
      setError(listingLimitReached(message.message), 'daily-limit')
    } else if (dropped) setError(LIBRARY_NOT_LOADED)
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
      pending?.kind === 'rebuildStale'
        ? listingLimitReached(message.message)
        : limitReached('activityCreate'),
      'daily-limit',
    )
  } else setError(message.message)
  if (message.issue !== undefined) handleAccountIssue(message.issue)
}
