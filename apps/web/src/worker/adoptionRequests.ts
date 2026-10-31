import type { ActivityRecord } from '@rca/contract'
import type { AnalysisSession, SessionState } from '@rca/core/session'
import { adoptDevice, standingOf } from './adoption'
import type { DeviceLibrary } from './deviceLibrary'
import { openOutbox } from './outbox'
import type { WorkerRequest, WorkerResponse } from './protocol'
import { loadServer } from './rebuild'
import type { LibraryContext } from './rebuild'
import type { SendingKeys } from './sendingKeys'
import { asWriter } from './updaterLock'
import type { WorkerView } from './workerView'
import type { Workbench } from './workbench'
import type { Writing } from './writerResume'

/** What the requests about the library kept in this browser read and change in the worker. */
export interface AdoptionRequestContext {
  session: AnalysisSession
  deviceLibrary: DeviceLibrary
  savedRecords: Map<string, ActivityRecord>
  sending: SendingKeys
  workbench: Workbench
  view: Pick<WorkerView, 'activeScope'>
  libraryContext: LibraryContext
  /** Answers a request: stamped with its number. */
  post: (message: WorkerResponse) => void
  /** The outbox resume that a library load started, if one is going. */
  resume: () => Writing | null
  /** The resume is over: the Add took its place. */
  resumeEnded: () => void
}

/** The recordings kept in this browser for an activity that the account has now. */
export function keptTraceDropper(workbench: Pick<Workbench, 'remove'>) {
  return async (digestId: string): Promise<void> => {
    await workbench.remove({ kind: 'device' }, digestId)
  }
}

/** Tells the page what the library kept in this browser holds for the account, when it holds something. */
export async function offerDevice(ctx: AdoptionRequestContext, userId: string): Promise<void> {
  const standing = await standingOf(ctx.deviceLibrary, ctx.savedRecords)
  if (standing === null) return
  const { adoptable, again, held } = standing.offer
  const current = ctx.view.activeScope
  // The account may have changed while the kept library was read.
  if (current?.kind !== 'account' || current.userId !== userId) return
  // Apart from any request: stamped with one, the page would drop it as late.
  if (adoptable + again + held > 0)
    self.postMessage({ type: 'deviceOffer', adoptable, again, held } satisfies WorkerResponse)
}

/** After the kept library changed under a signed-in page: what it holds now, and what is still offered. */
async function reportDeviceLeft(ctx: AdoptionRequestContext): Promise<void> {
  const standing = await standingOf(ctx.deviceLibrary, ctx.savedRecords)
  if (standing === null) return
  ctx.post({ type: 'deviceHolds', holds: standing.holds })
  ctx.post({ type: 'deviceOffer', ...standing.offer })
}

/** Adds the activities kept in this browser to the account, then reads the library again. */
export async function adoptDeviceRequest(
  ctx: AdoptionRequestContext,
  request: Extract<WorkerRequest, { type: 'adoptDevice' }>,
): Promise<SessionState> {
  if (ctx.view.activeScope?.kind !== 'account' || ctx.view.activeScope.userId !== request.userId)
    throw new Error('Reload your library before adding what this browser kept.')
  // Saves left from an earlier visit finish through the same outbox, so they go first.
  ctx.resume()?.cancel()
  await ctx.resume()?.finished
  ctx.resumeEnded()
  // In the tab that holds the account's writer lock only, as the resume is: two tabs never send the same rows.
  const added = await asWriter(request.userId, () =>
    adoptDevice({
      userId: request.userId,
      library: ctx.deviceLibrary,
      outbox: openOutbox(request.userId),
      savedRecords: ctx.savedRecords,
      sending: ctx.sending,
      // The page is busy while it runs; the outbox's own progress line is about an import, not this.
      post: () => undefined,
      adopted: keptTraceDropper(ctx.workbench),
    }),
  )
  if (!added.writer)
    throw new Error('Another tab is saving to this account. Add these when it has finished.')
  const result = added.value
  const { saved, conflicts, failed, again, held } = result
  ctx.post({ type: 'adoption', saved, conflicts, failed, again, held })
  if (result.stopped !== null) ctx.post({ type: 'accountIssue', issue: result.stopped })
  await reportDeviceLeft(ctx)
  // What was added is in the account, not yet in the session: read the library again.
  return loadServer(ctx.libraryContext, request.settings, request.userId, undefined)
}

/** Empties the library kept in this browser while the account is on screen, which stays as it is. */
export async function forgetDeviceLibraryRequest(
  ctx: AdoptionRequestContext,
  request: Extract<WorkerRequest, { type: 'forgetDeviceLibrary' }>,
): Promise<SessionState> {
  await ctx.deviceLibrary.clear()
  await ctx.workbench.clearScope({ kind: 'device' })
  ctx.post({ type: 'deviceHolds', holds: false })
  ctx.post({ type: 'deviceOffer', adoptable: 0, again: 0, held: 0 })
  return ctx.session.setSettings(request.settings)
}
