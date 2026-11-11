import type { ActivityRecord } from '@rca/contract'
import type { AnalysisSession, SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { renameActivity } from '../api/renameClient'
import { reloadIndex } from './applyListLabels'
import type { DeviceActions } from './device'
import type { DeviceLibrary } from './deviceLibrary'
import type { WorkerView } from './workerView'

/** What a rename needs of the worker. */
export interface RenameContext {
  session: AnalysisSession
  deviceLibrary: DeviceLibrary
  device: Pick<DeviceActions, 'epochNow' | 'report'>
  savedRecords: Map<string, ActivityRecord>
  view: Pick<WorkerView, 'activeScope'>
  reportLibrary: () => void
}

const NOT_LOADED = 'Reload your library before renaming this activity.'
const NOT_KEPT = 'This activity is no longer kept in this browser.'
const NOT_READ =
  'Your kept results could not be read from this browser just now. Reload the page to try again.'

/** Renames an activity of the account library: the server first, then the copy the page holds. */
async function renameSaved(
  ctx: RenameContext,
  request: { id: string; name: string; userId: string },
): Promise<null> {
  const { activeScope } = ctx.view
  if (activeScope?.kind !== 'account' || activeScope.userId !== request.userId) {
    throw new Error(NOT_LOADED)
  }
  const record = ctx.savedRecords.get(request.id)
  if (!record) throw new Error(NOT_LOADED)
  const { name } = await renameActivity(request.id, request.name, request.userId)
  ctx.savedRecords.set(request.id, { ...record, digest: { ...record.digest, name } })
  ctx.reportLibrary()
  reloadIndex(ctx.session, [...ctx.savedRecords.values()])
  return null
}

/** Renames a workout kept in this browser, in its library, then puts the session on the library as it now stands. */
async function renameKept(
  ctx: RenameContext,
  request: { id: string; name: string; settings: AthleteSettings },
): Promise<SessionState> {
  const found = await ctx.deviceLibrary.lookup(request.id).catch(() => {
    throw new Error(NOT_READ)
  })
  if (found === null) throw new Error(NOT_KEPT)
  if (typeof found === 'string') throw new Error(NOT_READ)
  const epoch = ctx.device.epochNow() ?? undefined
  const written = await ctx.deviceLibrary.setName(request.id, found.id, request.name, epoch)
  if (!written) throw new Error(NOT_KEPT)
  await ctx.device.report()
  const entries = await ctx.deviceLibrary.all().catch(() => {
    throw new Error(NOT_READ)
  })
  return ctx.session.loadDigests(
    entries.map((entry) => entry.digest),
    request.settings,
    { keepUnsaved: true },
  )
}

/** The name the athlete gave an activity, kept in the account (a null `userId` is not one) or in this browser. The account's answer is no state. */
export function renameRequest(
  ctx: RenameContext,
  request: { id: string; name: string; userId: string | null; settings: AthleteSettings },
): Promise<SessionState | null> {
  return request.userId === null
    ? renameKept(ctx, request)
    : renameSaved(ctx, { ...request, userId: request.userId })
}
