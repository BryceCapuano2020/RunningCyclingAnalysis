import type { ActivityRecord } from '@rca/contract'
import type { AnalysisSession, SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { ApiRequestError, deleteActivity } from '../api/client'
import { workoutKeyOf as activityKey } from './device'
import type { DeviceActions } from './device'
import { accountScope } from './checkinStore'
import { copiesOf, shownCount } from './hiddenCopies'
import { forgetHeldKeys } from './heldIndex'
import type { WorkerResponse } from './protocol'
import type { RouteMemory } from './routes'
import type { Workbench } from './workbench'

/** What deleting a saved activity reads and changes in the worker. */
export interface DeleteGroupContext {
  session: AnalysisSession
  savedRecords: Map<string, ActivityRecord>
  unmatchedOriginals: Set<string>
  missingOriginals: Set<string>
  routes: Pick<RouteMemory, 'forget'>
  workbench: Pick<Workbench, 'remove'>
  device: Pick<DeviceActions, 'dropKept'>
  post: (message: WorkerResponse) => void
  reportLibrary: () => void
}

/**
 * Forgets one saved record that the server no longer has: its place in the worker, the file index, its recordings and
 * the copy kept in this browser, so the activity cannot return after a sign-out. The account copy is already gone, so
 * a copy that cannot be removed here does not fail the delete; the caller tells the page, once. True when all was cleared.
 */
async function forgetRecord(
  ctx: DeleteGroupContext,
  record: ActivityRecord,
  userId: string,
): Promise<boolean> {
  const key = activityKey(record.digest)
  ctx.savedRecords.delete(record.id)
  ctx.unmatchedOriginals.delete(record.id)
  ctx.routes.forget(record.id)
  ctx.missingOriginals.delete(key)
  // The file this activity came from is read again if it is added again.
  await forgetHeldKeys(accountScope(userId), [key])
  await forgetHeldKeys('device', [key])
  const traceCleared = await ctx.workbench.remove({ kind: 'account', userId }, record.digest.id)
  const deviceTraceCleared = await ctx.workbench.remove({ kind: 'device' }, record.digest.id)
  const keptDropped = await ctx.device.dropKept(key).then(
    () => true,
    () => false,
  )
  return traceCleared && deviceTraceCleared && keptDropped
}

/**
 * Deletes a saved activity from the account, and with it every near-copy of the same workout (rule R). The activity
 * the athlete sees stands for its whole group: deleting only it would let a hidden copy take its place. The one asked
 * for goes first, so a failure leaves the others as they were. The members the server has already deleted are gone
 * from the list and the session whether or not a later one failed.
 */
export async function deleteSavedGroup(
  ctx: DeleteGroupContext,
  record: ActivityRecord,
  userId: string,
  settings: AthleteSettings,
): Promise<SessionState> {
  const group = copiesOf(ctx.savedRecords.values(), record)
  const removed: ActivityRecord[] = []
  let cleared = true
  let state: SessionState | null = null
  try {
    for (const member of group) {
      try {
        await deleteActivity(member.id, userId)
      } catch (error) {
        // Another tab may already have deleted this exact record.
        if (!(error instanceof ApiRequestError && error.status === 404)) throw error
      }
      removed.push(member)
      cleared = (await forgetRecord(ctx, member, userId)) && cleared
    }
  } finally {
    if (removed.length > 0) {
      if (!cleared) ctx.post({ type: 'deviceIssue', issue: 'notForgotten' })
      ctx.reportLibrary()
      ctx.post({
        type: 'missingOriginals',
        count: shownCount(ctx.missingOriginals, ctx.savedRecords.values()),
      })
    }
    for (const member of removed) {
      state = ctx.session.removeActivity(member.digest.sport, member.digest.startMs, settings)
    }
  }
  return state!
}
