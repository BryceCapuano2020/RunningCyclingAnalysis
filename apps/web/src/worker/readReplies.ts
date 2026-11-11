import type { ActivityRecord } from '@rca/contract'
import type { AnalysisSession } from '@rca/core/session'
import { exportAccount } from './exportAccount'
import { hiddenRecordIds } from './hiddenCopies'
import type { ImportRunContext } from './importRun'
import type { WorkerRequest, WorkerResponse } from './protocol'
import type { RouteMemory } from './routes'
import { activityTraceReply } from './traceReply'
import type { Workbench } from './workbench'
import type { WorkerView } from './workerView'

/** What the requests that read the library without changing it need of the worker. */
export interface ReadContext {
  savedRecords: Map<string, ActivityRecord>
  session: AnalysisSession
  workbench: Workbench
  view: WorkerView
  routes: RouteMemory
  importContext: ImportRunContext
  /** Tells the page which detail this browser holds, before the reply. */
  reportDetail: () => Promise<void>
}

type ReadRequest = Extract<
  WorkerRequest,
  { type: 'exportData' | 'activitySplits' | 'routeShape' | 'forgetRoutes' | 'activityTrace' }
>

/** Whether the request reads the library, answered by `readReply` with something other than a session state. */
export function isReadRequest(request: WorkerRequest): request is ReadRequest {
  return (
    request.type === 'exportData' ||
    request.type === 'activitySplits' ||
    request.type === 'routeShape' ||
    request.type === 'forgetRoutes' ||
    request.type === 'activityTrace'
  )
}

/** The reply to a read: the export, a run's splits, a route, or a detail trace. */
export async function readReply(ctx: ReadContext, request: ReadRequest): Promise<WorkerResponse> {
  switch (request.type) {
    case 'exportData':
      return {
        type: 'exportReady',
        file: await exportAccount(request, hiddenRecordIds(ctx.savedRecords.values())),
      }
    case 'activitySplits':
      return { type: 'splits', id: request.id, splits: ctx.session.splitsOf(request.id) }
    case 'routeShape':
    case 'forgetRoutes':
      if (request.type === 'forgetRoutes') {
        ctx.workbench.clearMemory()
        ctx.view.activeScope = null
      }
      return ctx.routes.reply(request)
    case 'activityTrace': {
      const reply = await activityTraceReply(ctx.importContext, request)
      // Reading a trace back from an original stores it, which may push an older one out. The page
      // hears of that before the reply: nothing the worker says after its reply is attributed.
      if (request.fromOriginal === true) await ctx.reportDetail()
      return { type: 'activityTrace', reply }
    }
  }
}
