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

/** What a memory entry stands for: a trace also kept in storage, or one held in memory alone. */
interface MemoryEntry {
  scope: TraceScope
  trace: ActivityTrace
  /** Stored traces can be removed by another tab, so they are checked before they are served. */
  stored: boolean
}

/** Bounded worker cache and its IndexedDB backing store. Cache failures never affect digest saves. */
export class Workbench {
  private readonly store: WorkbenchStore
  private readonly traces = new Map<string, MemoryEntry>()

  constructor(store: WorkbenchStore = openWorkbenchStore()) {
    this.store = store
  }

  /**
   * Whether the scope's evidence was deleted, or null when storage cannot say. Unknown is not
   * deleted: a trace is then kept in memory alone, so the recording still opens for this visit.
   */
  private async deleted(scope: TraceScope): Promise<boolean | null> {
    return await this.store.isDeleted(scope).catch(() => null)
  }

  /**
   * Keeps one serialized evidence trace, in storage too when storage takes it. The source Activity is
   * not retained.
   */
  async capture(activity: Activity, scope: TraceScope): Promise<ActivityTrace | null> {
    try {
      if (!activityFitsEntry(activity)) return null
      const trace = activityTraceOf(activity)
      if (activityTraceBytes(trace) > WORKBENCH_ENTRY_BYTES) return null
      const before = await this.deleted(scope)
      if (before === true) return null
      const stored = before === false && (await this.store.put(scope, trace).catch(() => false))
      if (!stored && (await this.deleted(scope)) === true) return null
      this.remember(scope, trace, stored)
      return trace
    } catch {
      // Evidence is optional. A malformed or oversized trace does not interrupt analysis or saving.
      return null
    }
  }

  /**
   * Keeps just the trace in memory, for an activity that is not kept in this browser: the ephemeral
   * sample, or the files of a visitor whose account is not known yet.
   */
  captureMemory(activity: Activity, scope: TraceScope): void {
    try {
      if (!activityFitsEntry(activity)) return
      const trace = activityTraceOf(activity)
      if (activityTraceBytes(trace) <= WORKBENCH_ENTRY_BYTES) this.remember(scope, trace, false)
    } catch {
      // Memory evidence is optional too.
    }
  }

  async get(scope: TraceScope, activityId: string): Promise<ActivityTrace | null> {
    const key = memoryKey(scope, activityId)
    if ((await this.deleted(scope)) === true) {
      this.traces.delete(key)
      return null
    }
    const cached = this.traces.get(key)
    if (cached) {
      // Another tab may have removed a stored trace since this one remembered it.
      if (!cached.stored || (await this.store.has(scope, activityId).catch(() => false))) {
        this.traces.delete(key)
        this.traces.set(key, cached)
        return cached.trace
      }
      this.traces.delete(key)
    }
    const trace = await this.store.get(scope, activityId).catch(() => null)
    if (trace) this.remember(scope, trace, true)
    return trace
  }

  /** Drops per-tab references when a session or account identity changes. */
  clearMemory(): void {
    this.traces.clear()
  }

  /** Drops one memory-only trace, for an activity that was never stored. */
  dropMemory(scope: TraceScope, activityId: string): void {
    this.traces.delete(memoryKey(scope, activityId))
  }

  /** False only when storage refused the removal; storage that cannot be opened holds nothing. */
  async remove(scope: TraceScope, activityId: string): Promise<boolean> {
    this.dropMemory(scope, activityId)
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

  private remember(scope: TraceScope, trace: ActivityTrace, stored: boolean): void {
    const key = memoryKey(scope, trace.activityId)
    this.traces.delete(key)
    this.traces.set(key, { scope, trace, stored })
    while (this.traces.size > MEMORY_ENTRIES) {
      const oldest = this.traces.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.traces.delete(oldest)
    }
  }
}
