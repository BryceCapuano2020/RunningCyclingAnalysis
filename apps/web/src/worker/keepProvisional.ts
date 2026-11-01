import type { AnalysisSession, SessionState, SyncItem } from '@rca/core/session'
import type { checkInWorker } from './checkinWorker'
import type { DeviceActions } from './device'
import { deviceKeeper } from './deviceKeeper'
import type { WorkerResponse } from './protocol'
import type { Workbench } from './workbench'

/** What keeping the activities of a provisional import in this browser reads and changes in the worker. */
export interface KeepProvisionalContext {
  session: AnalysisSession
  device: DeviceActions
  workbench: Workbench
  checkIns: ReturnType<typeof checkInWorker>
  post: (message: WorkerResponse) => void
  /** The activities provisional imports analysed, by workout, with no file bytes. */
  provisionalItems: Map<string, SyncItem>
}

/** The kept library was emptied under an import: the page is told, and starts from what is kept now. */
function stopEmptied(ctx: KeepProvisionalContext): SessionState {
  ctx.post({ type: 'deviceIssue', issue: 'replaced' })
  ctx.device.replaced()
  ctx.workbench.clearMemory()
  return ctx.session.clear()
}

/** Keeps what a provisional import analysed in this browser: nobody turned out to be signed in. */
export async function keepProvisional(
  ctx: KeepProvisionalContext,
  settings: Parameters<AnalysisSession['setSettings']>[0],
): Promise<SessionState> {
  const { session, device, workbench, checkIns, post, provisionalItems } = ctx
  const keeper = deviceKeeper(device, post)
  const held = [...provisionalItems.values()]
  provisionalItems.clear()
  for (const item of held) await keeper.keep(item)
  await checkIns.keepProvisional('device')
  // Not when the kept library was emptied meanwhile: the recordings would outlive their activities.
  const emptied = keeper.replaced || workbench.libraryReplaced || !(await device.current())
  if (emptied) workbench.dropDeferred()
  await workbench.storeDeferred()
  if (emptied || workbench.libraryReplaced) return stopEmptied(ctx)
  await device.report()
  keeper.report()
  return session.setSettings(settings)
}
