import type { ActivityRecord } from '@rca/contract'
import type { LabelProposal } from '@rca/core/import/applyLabels'
import type { AnalysisSession, SessionState } from '@rca/core/session'
import type { AthleteSettings } from '@rca/core/types'
import { reloadSession, undoListLabels } from './applyListLabels'
import type { DeviceLabelling } from './deviceLabels'
import { DEVICE_LABELS } from './labelUndo'
import type { LabelUndo } from './labelUndo'

/** What taking the labels off needs of the worker. */
export interface UndoLabelsContext {
  labelUndo: LabelUndo
  session: AnalysisSession
  savedRecords: Map<string, ActivityRecord>
  /** Takes labels off the workouts kept in this browser. */
  deviceLabels: {
    undo(applied: readonly LabelProposal[], settings: AthleteSettings): Promise<DeviceLabelling>
  }
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
  request: { userId: string | null; settings: AthleteSettings },
): Promise<{ state: SessionState; left: number }> {
  // No account: the labels are those of the library kept in this browser.
  const owner = request.userId ?? DEVICE_LABELS
  const applied = ctx.labelUndo.take(owner, ctx.epoch())
  if (applied.length === 0) return { state: ctx.session.setSettings(request.settings), left: 0 }
  if (request.userId === null) {
    const done = await ctx.deviceLabels.undo(applied, request.settings)
    const taken = new Set(done.labelled.map(({ id }) => id))
    const left = applied.filter(({ id }) => !taken.has(id))
    if (left.length > 0) ctx.labelUndo.remember(owner, ctx.epoch(), left)
    return {
      state: done.state ?? ctx.session.setSettings(request.settings),
      left: left.length,
    }
  }
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
