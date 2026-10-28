import type { ActivityTrace } from '@rca/core/workbench'
import { activityTraceOf } from '@rca/core/workbench'
import type { Activity } from '@rca/core/types'
import { openWorkbenchStore } from './workbenchStore'
import { activityTraceBytes, WORKBENCH_ENTRY_BYTES } from './workbenchStore'
import type { TraceScope, WorkbenchStore } from './workbenchStore'

export type ActivityTraceReply =
  | { kind: 'trace'; trace: ActivityTrace }
  | { kind: 'original' }
  | { kind: 'missing' }
  | { kind: 'failed' }

const MEMORY_ENTRIES = 4

/** Estimates output size before activityTraceOf clones any of the source streams. */
function activityFitsEntry(activity: Activity): boolean {
  const n = activity.n
  if (
    !Number.isInteger(n) ||
    n < 0 ||
    activity.distance.length !== n ||
    activity.paused.length !== n
  )
    return false
  if (
    activity.speed.length !== n ||
    activity.altitude.length !== n ||
    activity.heartRate.length !== n ||
    activity.power.length !== n ||
    (activity.cadence !== undefined && activity.cadence.length !== n) ||
    (activity.temperature !== undefined && activity.temperature.length !== n) ||
    (activity.unrecorded !== undefined && activity.unrecorded.length !== n)
  )
    return false
  const streamCount =
    3 + (activity.hasPower ? 1 : 0) + (activity.cadence ? 1 : 0) + (activity.temperature ? 1 : 0)
  const bytes =
    activity.distance.byteLength +
    activity.paused.byteLength +
    n +
    n * 4 * streamCount +
    (activity.cadenceUnit?.length ?? 0) * 2 +
    (activity.laps ?? []).reduce((sum, lap) => sum + 32 + (lap.label?.length ?? 0) * 2, 0)
  return bytes <= WORKBENCH_ENTRY_BYTES
}

function memoryKey(scope: TraceScope, activityId: string): string {
  return JSON.stringify([scope.kind, scope.kind === 'account' ? scope.userId : '', activityId])
}

/** Bounded worker cache and its IndexedDB backing store. Cache failures never affect digest saves. */
export class Workbench {
  private readonly store: WorkbenchStore
  private readonly traces = new Map<string, { scope: TraceScope; trace: ActivityTrace }>()

  constructor(store: WorkbenchStore = openWorkbenchStore()) {
    this.store = store
  }

  /** Stores one serialized evidence trace. The source Activity is not retained. */
  async capture(activity: Activity, scope: TraceScope): Promise<ActivityTrace | null> {
    try {
      if (!activityFitsEntry(activity)) return null
      const trace = activityTraceOf(activity)
      if (activityTraceBytes(trace) > WORKBENCH_ENTRY_BYTES) return null
      if (await this.store.isDeleted(scope).catch(() => scope.kind === 'account')) return null
      const saved = await this.store.put(scope, trace).catch(() => false)
      if (!saved && (await this.store.isDeleted(scope).catch(() => scope.kind === 'account')))
        return null
      this.remember(scope, trace)
      return trace
    } catch {
      // Evidence is optional. A malformed or oversized trace does not interrupt analysis or saving.
      return null
    }
  }

  /** Keeps just the selected trace in memory for an ephemeral sample. */
  captureSample(activity: Activity): void {
    try {
      if (!activityFitsEntry(activity)) return
      const trace = activityTraceOf(activity)
      if (activityTraceBytes(trace) <= WORKBENCH_ENTRY_BYTES)
        this.remember({ kind: 'device' }, trace)
    } catch {
      // Sample evidence is optional too.
    }
  }

  async get(scope: TraceScope, activityId: string): Promise<ActivityTrace | null> {
    if (await this.store.isDeleted(scope).catch(() => scope.kind === 'account')) {
      this.traces.delete(memoryKey(scope, activityId))
      return null
    }
    const key = memoryKey(scope, activityId)
    const cached = this.traces.get(key)
    if (cached) {
      this.traces.delete(key)
      this.traces.set(key, cached)
      return cached.trace
    }
    const trace = await this.store.get(scope, activityId).catch(() => null)
    if (trace) this.remember(scope, trace)
    return trace
  }

  /** Drops per-tab references when a session or account identity changes. */
  clearMemory(): void {
    this.traces.clear()
  }

  async remove(scope: TraceScope, activityId: string): Promise<boolean> {
    this.traces.delete(memoryKey(scope, activityId))
    return await this.store.remove(scope, activityId).catch(() => false)
  }

  async clearScope(scope: TraceScope): Promise<boolean> {
    const owner = scope.kind === 'device' ? 'device' : `account:${scope.userId}`
    for (const [key, entry] of this.traces) {
      if ((entry.scope.kind === 'device' ? 'device' : `account:${entry.scope.userId}`) === owner)
        this.traces.delete(key)
    }
    return await this.store.clearScope(scope).catch(() => false)
  }

  async deleteScope(scope: Extract<TraceScope, { kind: 'account' }>): Promise<boolean> {
    const owner = scope.userId
    for (const [key, entry] of this.traces) {
      if (entry.scope.kind === 'account' && entry.scope.userId === owner) this.traces.delete(key)
    }
    return await this.store.deleteScope(scope).catch(() => false)
  }

  private remember(scope: TraceScope, trace: ActivityTrace): void {
    const key = memoryKey(scope, trace.activityId)
    this.traces.delete(key)
    this.traces.set(key, { scope, trace })
    while (this.traces.size > MEMORY_ENTRIES) {
      const oldest = this.traces.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.traces.delete(oldest)
    }
  }
}
