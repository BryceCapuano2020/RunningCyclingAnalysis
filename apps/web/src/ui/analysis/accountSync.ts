import { useCallback, useEffect, useRef } from 'react'
import type { SyncIssueCode } from '@rca/core/session'
import { drainBatches, EMPTY_SESSION } from './model'
import type { Account, Box, SetError } from './model'
import type { ImportState } from './importState'
import type { LibraryState } from './libraryState'
import { useLatest } from './useLatest'
import type { WorkerTransport } from './workerTransport'

interface AccountIssueDeps {
  accountRef: Box<Account>
  loadLibrary: (userId: string) => void
}

/** Acts on an account problem the worker reports: a lost session, or a changed account. */
export function useAccountIssue({ accountRef, loadLibrary }: AccountIssueDeps) {
  /** Reloads the account's library after the server reports a different account for it. */
  const reconcileAccount = useCallback(() => {
    const current = accountRef.current
    const refresh = current.refresh
    const submittedUserId = current.me?.user.id
    if (refresh === undefined || submittedUserId === undefined) return
    refresh().then(
      (found) => {
        // A different account is handled by the account transition; the same one is reloaded here.
        if (found?.user.id === submittedUserId) loadLibrary(submittedUserId)
      },
      () => undefined,
    )
  }, [accountRef, loadLibrary])

  return useCallback(
    (issue: SyncIssueCode) => {
      if (issue === 'signed-out') accountRef.current.markExpired?.()
      else if (issue === 'account-changed') reconcileAccount()
    },
    [accountRef, reconcileAccount],
  )
}

interface AccountTransitionDeps {
  account: Account
  accountEpochRef: Box<number>
  previousStatusRef: Box<Account['status']>
  previousUserIdRef: Box<string | null>
  transport: WorkerTransport
  imports: ImportState
  library: LibraryState
  setError: SetError
  addFiles: (files: File[]) => void
  loadLibrary: (userId: string) => void
  /** Loads the library kept in this browser into the worker, once per worker, when signed out. */
  loadDeviceOnce: () => void
  /** Empties every queue, so nothing the previous account started can run for the next one. */
  clearQueues: () => void
  /** Empties the session, keeping the period the visitor chose. Used before a library load. */
  clearSession: () => void
}

/**
 * Reacts to sign-in, sign-out and account changes. Runs after the worker effect, so a worker
 * created in the same commit is ready before this effect sends its first account-load request.
 * The effect reads the latest callbacks through useLatest and re-runs only when the account or the
 * worker generation changes.
 */
export function useAccountTransitions(deps: AccountTransitionDeps): void {
  const { status: accountStatus, me, sessionExpired } = deps.account
  const { workerGeneration } = deps.transport
  const latest = useLatest(deps)
  // A restarted worker has no account state, so its first pass must count as a load. The worker
  // effect's cleanup already resets these refs; reading the generation here keeps that dependency
  // explicit in this effect rather than relying on the other effect's ordering.
  const accountGenerationRef = useRef(0)

  useEffect(() => {
    const current = latest()
    if (accountGenerationRef.current !== workerGeneration) {
      accountGenerationRef.current = workerGeneration
      current.previousStatusRef.current = 'loading'
      current.previousUserIdRef.current = null
    }
    const userId = me?.user.id ?? null
    const before = current.previousStatusRef.current
    const previousUserId = current.previousUserIdRef.current
    current.previousStatusRef.current = accountStatus
    current.previousUserIdRef.current = userId
    const accountChanged =
      before === 'signed-in' && (accountStatus !== 'signed-in' || userId !== previousUserId)
    if (accountChanged && accountStatus === 'signed-out' && sessionExpired) {
      keepScreenAfterExpiry(current)
    } else if (accountChanged) {
      switchAccount(current)
    } else if (accountStatus === 'signed-in' && before !== 'signed-in') {
      // Nothing starts for a signed-in account until its profile has arrived.
      if (me !== null) {
        if (before === 'loading') loadSignedInLibrary(current, me.user.id)
        else startSession(current)
      }
    } else if (before === 'loading' && accountStatus !== 'loading') {
      // Nobody is signed in: the files analysed while the account loaded are saved once the kept
      // library has loaded, so each is compared with it. The reply to that load adds them. The
      // analysis queued ahead of the load is repeated, since a worker restart would re-enter here.
      current.library.libraryWaitRef.current.push(
        ...drainBatches(current.imports.provisionalImportsRef),
      )
      current.loadDeviceOnce()
    }
  }, [accountStatus, me, sessionExpired, workerGeneration, latest])
}

/**
 * The session ended without a sign-out. Keep what is on screen and stop saving. The next signed-out
 * import is analysed with the library kept in this browser, as a reload would, so the list and the
 * analysis agree. Imports that were waiting for the library are analysed that way now.
 */
function keepScreenAfterExpiry(deps: AccountTransitionDeps): void {
  deps.accountEpochRef.current += 1
  // The worker still holds this account's route shapes, so it is told to forget them.
  deps.transport.send({ type: 'forgetRoutes' })
  deps.library.setLibrary('idle')
  deps.library.setLibraryNotice(null)
  deps.library.setLibraryError(null)
  // The account's list is no longer this visitor's to manage, and it is not the browser's either.
  deps.library.setSavedActivities([])
  deps.library.setLibraryUnreadable(0)
  for (const files of drainBatches(deps.library.libraryWaitRef)) deps.addFiles(files)
}

/**
 * The signed-in account changed. The old account's work is dropped, and the new worker starts
 * empty. The next effect pass hydrates the new account.
 */
function switchAccount(deps: AccountTransitionDeps): void {
  const { accountEpochRef, imports, library, transport } = deps
  const cancelled =
    imports.pendingAsyncImportsRef.current > 0 || library.libraryWaitRef.current.length > 0
  accountEpochRef.current += 1
  // Stop A's queued sync operations before a later sign-in can give them B's cookie. The new
  // worker starts empty; a signed-in account will be hydrated by the next effect pass.
  deps.clearQueues()
  imports.setState(EMPTY_SESSION)
  imports.setProgress(null)
  imports.setUploading(null)
  deps.setError(
    cancelled
      ? 'An import was cancelled because the account changed. Select the files again.'
      : null,
  )
  imports.setRebuildNotice(null)
  library.setLibraryNotice(null)
  library.setLibraryError(null)
  transport.setWorkerStopped(false)
  library.setMissingOriginals(0)
  library.setLibraryUnreadable(0)
  library.setSavedActivities([])
  imports.setImportOutcome(null)
  library.setLibrary('idle')
  transport.automaticRestartCountRef.current = 0
  // Make the next effect pass hydrate the new signed-in identity even for a direct A → B
  // switch where accountStatus remains "signed-in" throughout.
  deps.previousStatusRef.current = 'signed-out'
  transport.restartWorker()
}

/** A sign-in after the account was already known: a new session, and a new worker to load it. */
function startSession(deps: AccountTransitionDeps): void {
  // A new sign-in starts with a new session, so earlier sync issues are cleared. The new
  // worker's account pass loads the library.
  deps.imports.setState(EMPTY_SESSION)
  deps.imports.setImportOutcome(null)
  deps.setError(null)
  deps.transport.restartWorker()
}

/**
 * The first sign-in of the page: load the library, then save the files analysed while it loaded to
 * the account. The session they were shown in is cleared first, so a failed load leaves nothing that
 * was never saved on screen. They join the library's imports, so they wait for it, and a failed load
 * drops them. The wait is queued before the load, so the page is busy waiting from the first render.
 */
function loadSignedInLibrary(deps: AccountTransitionDeps, userId: string): void {
  // The analysis queued ahead of this load means each file is analysed twice. Restarting the worker
  // would avoid that, but a restart re-enters this transition, so the repeat is left as it is.
  const batches = drainBatches(deps.imports.provisionalImportsRef)
  if (batches.length > 0) {
    deps.clearSession()
    deps.library.libraryWaitRef.current.push(...batches)
  }
  deps.loadLibrary(userId)
}
