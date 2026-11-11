import type { AnalysisSession, SessionState, SyncItem } from '@rca/core/session'
import { clearCheckinScope } from './checkinStore'
import type { DeviceActions } from './device'
import type { FailedOriginals } from './failedOriginals'
import type { LabelUndo } from './labelUndo'
import { clearLifts } from './liftStore'
import { clearOutbox } from './outbox'
import type { WorkerResponse } from './protocol'
import type { ResumeHolder } from './resumeHolder'
import type { RouteMemory } from './routes'
import type { Workbench } from './workbench'
import type { WorkerView } from './workerView'

/** What emptying the session reads and changes in the worker. */
export interface ClearContext {
  view: WorkerView
  labelUndo: LabelUndo
  resume: ResumeHolder
  failedOriginals: FailedOriginals
  provisionalItems: Map<string, SyncItem>
  workbench: Workbench
  routes: RouteMemory
  device: DeviceActions
  session: AnalysisSession
  post: (message: WorkerResponse) => void
}

/** Empties the session. With `forgetDevice` the library kept in this browser, its traces, waiting saves and lifting sets go too. */
export async function clearLibrary(
  ctx: ClearContext,
  forgetDevice: boolean,
): Promise<SessionState> {
  const { view, workbench, device } = ctx
  view.libraryEpoch++
  view.accountIndex = false
  ctx.labelUndo.clear()
  ctx.resume.cancel()
  ctx.failedOriginals.forget()
  ctx.provisionalItems.clear()
  view.showingSample = false
  workbench.clearMemory()
  ctx.routes.clear()
  if (forgetDevice) {
    // The page is told once: forget() has already told it when the library would not clear.
    const forgotten = await device.forget()
    // The index of files read goes with the library it describes.
    await clearCheckinScope('device')
    const tracesCleared = await workbench.clearScope({ kind: 'device' })
    // Every waiting save goes too, an expired session's included: nothing kept here stays, and a visitor who is
    // signed out has no account on screen to ask about them.
    const outboxCleared = await clearOutbox()
    // The logged lifting sets are nothing kept here either.
    const liftsCleared = await clearLifts()
    if ((!tracesCleared || !outboxCleared || !liftsCleared) && forgotten)
      ctx.post({ type: 'deviceIssue', issue: 'notForgotten' })
  } else device.replaced()
  return ctx.session.clear()
}
