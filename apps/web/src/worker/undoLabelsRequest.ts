import type { ActivityRecord } from '@rca/contract'
import type { AnalysisSession, SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { reloadSession, undoListLabels } from './applyListLabels'
import { LabelUndo } from './labelUndo'
import type { WorkerResponse } from './protocol'

/** What taking the labels off needs of the worker. */
export interface UndoLabelsContext {
  labelUndo: LabelUndo
  session: AnalysisSession
  savedRecords: Map<string, ActivityRecord>
  /** The library epoch now: labels applied under another one are stale and are not undone. */
  epoch: () => number
  reportLibrary: () => void
}

/**
 * Takes off the labels the last import applied. A row whose label could not be taken off (the write failed, for
 * instance offline) is kept to be undone again, and counted in `left`: the page clears the import's count only
 * once every row is undone, and says so when some could not be.
 */
export async function undoLabelsRequest(
  ctx: UndoLabelsContext,
  request: { userId: string; settings: AthleteSettings },
): Promise<{ state: SessionState; left: number }> {
  const applied = ctx.labelUndo.take(request.userId, ctx.epoch())
  if (applied.length === 0) return { state: ctx.session.setSettings(request.settings), left: 0 }
  const undone = await undoListLabels(applied, request.userId, (fresh) => {
    ctx.savedRecords.clear()
    for (const record of fresh) ctx.savedRecords.set(record.id, record)
  })
  const done = new Set(undone.map(({ id }) => id))
  const remaining = applied.filter(({ id }) => !done.has(id))
  if (remaining.length > 0) ctx.labelUndo.remember(request.userId, ctx.epoch(), remaining)
  ctx.reportLibrary()
  return {
    state: reloadSession(ctx.session, request.settings, [...ctx.savedRecords.values()]),
    left: remaining.length,
  }
}

/**
 * What the worker keeps for taking labels off: the labels the last import applied (`labelUndo`, which a clear or a load
 * of the library forgets) and the reply to an Undo, the state with how many labels are left when some could not be taken off.
 */
export function undoLabelsHandler(deps: Omit<UndoLabelsContext, 'labelUndo'>) {
  const labelUndo = new LabelUndo()
  return {
    labelUndo,
    async reply(
      request: { userId: string; settings: AthleteSettings },
      extra: { outdatedWithOriginal?: number },
    ): Promise<WorkerResponse> {
      const { state, left } = await undoLabelsRequest({ labelUndo, ...deps }, request)
      return { type: 'state', state, ...(left > 0 ? { labelsLeft: left } : {}), ...extra }
    },
  }
}
