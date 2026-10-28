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

/**
 * Where a memory entry's trace lives besides memory. A stored trace can be removed by another tab, so
 * it is checked before it is served. A pending one is meant for storage, which refused it or could
 * not be reached, and is written when storage next answers. A memory one is never written.
 */
type TraceHome = 'stored' | 'pending' | 'memory'

interface MemoryEntry {
  scope: TraceScope
  trace: ActivityTrace
  home: TraceHome
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
      this.remember(scope, trace, stored ? 'stored' : 'pending')
      // Storage answered, so what it refused or could not be reached for earlier is written now.
      if (stored) await this.writePending((key) => key !== memoryKey(scope, trace.activityId))
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
      if (activityTraceBytes(trace) <= WORKBENCH_ENTRY_BYTES) this.remember(scope, trace, 'memory')
    } catch {
      // Memory evidence is optional too.
    }
  }

  /**
   * Whether a recording is kept for the activity. A memory copy of a stored one counts only while
   * storage still has it. Storage that cannot say holds nothing, unless memory has the trace.
   */
  async holds(scope: TraceScope, activityId: string): Promise<boolean> {
    const cached = this.traces.get(memoryKey(scope, activityId))
    if (cached !== undefined && cached.home !== 'stored') return true
    const stored = await this.store.has(scope, activityId).catch(() => null)
    return cached === undefined ? stored === true : stored !== false
  }

  async get(scope: TraceScope, activityId: string): Promise<ActivityTrace | null> {
    const key = memoryKey(scope, activityId)
    if ((await this.deleted(scope)) === true) {
      this.traces.delete(key)
      return null
    }
    const cached = this.traces.get(key)
    if (cached) {
      if (cached.home === 'pending') await this.writePending((other) => other === key)
      // Writing can drop the entry, when its scope was deleted meanwhile; storage then answers.
      if (this.traces.get(key) === cached) {
        // Another tab may have removed a stored trace since this one remembered it. Storage that
        // cannot say leaves the trace served: it is gone only when storage says it is.
        if (
          cached.home !== 'stored' ||
          (await this.store.has(scope, activityId).catch(() => null)) !== false
        ) {
          this.traces.delete(key)
          this.traces.set(key, cached)
          return cached.trace
        }
        this.traces.delete(key)
      }
    }
    const trace = await this.store.get(scope, activityId).catch(() => null)
    if (trace) this.remember(scope, trace, 'stored')
    return trace
  }

  /**
   * Writes the pending entries that `wanted` accepts to storage, now that it answers. An entry of a
   * deleted scope is dropped instead, and one that storage still refuses stays pending.
   */
  private async writePending(wanted: (key: string) => boolean): Promise<void> {
    for (const [key, entry] of [...this.traces]) {
      if (entry.home !== 'pending' || !wanted(key)) continue
      const deleted = await this.deleted(entry.scope)
      if (deleted === true && this.traces.get(key) === entry) this.traces.delete(key)
      if (deleted !== false || this.traces.get(key) !== entry) continue
      const saved = await this.store.put(entry.scope, entry.trace).catch(() => false)
      if (!saved) continue
      if (this.traces.get(key) === entry) entry.home = 'stored'
      // It was removed while it was being written, so the write must not bring it back.
      else await this.store.remove(entry.scope, entry.trace.activityId).catch(() => false)
    }
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

  private remember(scope: TraceScope, trace: ActivityTrace, home: TraceHome): void {
    const key = memoryKey(scope, trace.activityId)
    this.traces.delete(key)
    this.traces.set(key, { scope, trace, home })
    while (this.traces.size > MEMORY_ENTRIES) {
      const oldest = this.traces.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.traces.delete(oldest)
    }
  }
}
