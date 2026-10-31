import type { ActivityRecord } from '@rca/contract'
import { sampleActivityById } from './sampleClock'
import { originalActivity } from './originalActivity'
import type { ActivityTraceReply, Workbench } from './workbench'
import type { WorkerRequest } from './protocol'
import type { WorkerView } from './workerView'

/** What a trace reply reads: the library on screen, the recordings, and the saved records. */
export interface TraceReplyContext {
  view: WorkerView
  workbench: Workbench
  savedRecords: ReadonlyMap<string, ActivityRecord>
}

/**
 * The detail recording of one activity of the library on screen: from the cache, from the sample, or read back from the
 * original file only when the request asks for it.
 */
export async function activityTraceReply(
  { view, workbench, savedRecords }: TraceReplyContext,
  request: Extract<WorkerRequest, { type: 'activityTrace' }>,
): Promise<ActivityTraceReply> {
  const scope =
    view.activeScope !== null &&
    (request.userId === undefined
      ? view.activeScope.kind === 'device'
      : view.activeScope.kind === 'account' && view.activeScope.userId === request.userId)
      ? view.activeScope
      : null
  if (scope === null) return { kind: 'failed' }
  const cached = await workbench.get(scope, request.id)
  if (cached !== null) return { kind: 'trace', trace: cached }
  if (request.userId === undefined) {
    if (!view.showingSample) return { kind: 'missing' }
    const activity = sampleActivityById(view.sampleClock, request.id)
    if (activity === undefined) return { kind: 'missing' }
    workbench.captureMemory(activity, scope)
    const trace = await workbench.get(scope, request.id)
    return trace === null ? { kind: 'missing' } : { kind: 'trace', trace }
  }
  const record = [...savedRecords.values()].find((candidate) => candidate.digest.id === request.id)
  if (record === undefined || !record.hasFile) return { kind: 'missing' }
  if (request.fromOriginal !== true) return { kind: 'original' }
  try {
    const { activity } = await originalActivity(record, request.userId, request.id)
    if (activity === undefined) return { kind: 'missing' }
    const trace = await workbench.capture(activity, scope)
    return trace === null ? { kind: 'missing' } : { kind: 'trace', trace }
  } catch {
    return { kind: 'failed' }
  }
}
