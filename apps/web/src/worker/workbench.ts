import type { ActivityTrace } from '@rca/core/workbench'
import { traceQualityOf } from '@rca/core/quality'
import { activityTraceOf } from '@rca/core/workbench'
import type { Activity } from '@rca/core/types'
import { openWorkbenchStore } from './workbenchStore'
import { activityFitsEntry } from './workbenchFit'
import { scopeKey } from './workbenchSchema'
import { activityTraceBytes, WORKBENCH_ENTRY_BYTES, WORKBENCH_TOTAL_BYTES } from './workbenchStore'
import type { PutResult, TraceScope, WorkbenchStore } from './workbenchStore'

export type ActivityTraceReply =
  | { kind: 'trace'; trace: ActivityTrace }
  | { kind: 'original' }
  | { kind: 'missing' }
  | { kind: 'failed' }

const MEMORY_ENTRIES = 4

/**
 * The trace of an activity with the seconds its quality assessment leaves out, so the zones on its page
 * count what the sport page's do. An import has digested the activity just before, so the assessment is
 * already made and a capture stays cheap.
 */
function traceOf(activity: Activity): ActivityTrace {
  return activityTraceOf(activity, traceQualityOf(activity))
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
  /** When the activity started, which storage ranks its recording by. Read when a pending one is written. */
  startMs: number
}

interface DeferredTrace {
  scope: TraceScope
  trace: ActivityTrace
  bytes: number
  startMs: number
}

/** A recording the cache turned away for being older than everything it could drop, and its size. */
interface Outranked {
  startMs: number
  bytes: number
}

/** Bounded worker cache and its IndexedDB backing store. Cache failures never affect digest saves. */
export class Workbench {
  private readonly store: WorkbenchStore
  private readonly traces = new Map<string, MemoryEntry>()
  /**
   * The newest, smallest recording storage has turned away as outranked. While no recording is removed,
   * storage can only fill up, so one that started no later and is no smaller is outranked too, and
   * is not offered. A bulk import is mostly such recordings once the cache is full.
   */
  private outranked: Outranked | null = null
  /** Recordings waiting for `storeDeferred`, by memory key. Their sizes add up to at most the cache's. */
  private readonly deferred = new Map<string, DeferredTrace>()
  private deferredBytes = 0

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

  /** The trace of an activity, or null when it is too big for the cache or cannot be built. */
  private builtTrace(activity: Activity): { trace: ActivityTrace; bytes: number } | null {
    if (!activityFitsEntry(activity)) return null
    const trace = traceOf(activity)
    const bytes = activityTraceBytes(trace)
    return bytes > WORKBENCH_ENTRY_BYTES ? null : { trace, bytes }
  }

  /**
   * Keeps one serialized evidence trace, in storage too when storage takes it. Storage that is full
   * of newer activities' recordings leaves this one in memory alone. The source Activity is not
   * retained.
   */
  async capture(activity: Activity, scope: TraceScope): Promise<ActivityTrace | null> {
    try {
      const built = this.builtTrace(activity)
      if (built === null) return null
      const kept = await this.keep(scope, built.trace, built.bytes, activity.startMs)
      return kept === null ? null : built.trace
    } catch {
      // Evidence is optional. A malformed or oversized trace does not interrupt analysis or saving.
      return null
    }
  }

  /**
   * As capture, but storage is written later, by `storeDeferred`. A bulk import's recordings mostly
   * outnumber what the cache holds, so storing each as it arrives writes many that the next ones
   * push out again. Held back, only the newest that fit are written, newest first, with no
   * evictions. The trace is kept in memory meanwhile, up to the size of the cache.
   */
  captureDeferred(activity: Activity, scope: TraceScope): ActivityTrace | null {
    try {
      const built = this.builtTrace(activity)
      if (built === null) return null
      const { trace, bytes } = built
      const key = memoryKey(scope, trace.activityId)
      this.undefer(key)
      this.deferred.set(key, { scope, trace, bytes, startMs: activity.startMs })
      this.deferredBytes += bytes
      while (this.deferredBytes > WORKBENCH_TOTAL_BYTES) this.dropOldestDeferred()
      this.remember(scope, trace, 'memory', activity.startMs)
      return trace
    } catch {
      return null
    }
  }

  /**
   * Writes the deferred recordings to storage, newest first, and resolves with the ids of those
   * that were stored. One that storage leaves out or refuses is handled as `capture` handles it.
   */
  async storeDeferred(): Promise<Set<string>> {
    const items = [...this.deferred.values()].sort((a, b) => b.startMs - a.startMs)
    this.deferred.clear()
    this.deferredBytes = 0
    const stored = new Set<string>()
    for (const { scope, trace, bytes, startMs } of items) {
      const kept = await this.keep(scope, trace, bytes, startMs).catch(() => null)
      if (kept === 'stored') stored.add(trace.activityId)
    }
    return stored
  }

  private undefer(key: string): void {
    const held = this.deferred.get(key)
    if (held === undefined) return
    this.deferredBytes -= held.bytes
    this.deferred.delete(key)
  }

  private dropOldestDeferred(): void {
    let oldest: string | undefined
    for (const [key, item] of this.deferred) {
      if (oldest === undefined || item.startMs < this.deferred.get(oldest)!.startMs) oldest = key
    }
    if (oldest === undefined) this.deferredBytes = 0
    else this.undefer(oldest)
  }

  /**
   * Offers a built trace to storage and remembers it by what storage said. Null when the scope's
   * evidence was deleted; otherwise where it ended up.
   */
  private async keep(
    scope: TraceScope,
    trace: ActivityTrace,
    bytes: number,
    startMs: number,
  ): Promise<TraceHome | null> {
    if (this.knownOutranked(startMs, bytes)) {
      this.remember(scope, trace, 'memory', startMs)
      return 'memory'
    }
    const before = await this.deleted(scope)
    if (before === true) return null
    const put: PutResult =
      before === false
        ? await this.store.put(scope, trace, startMs).catch((): PutResult => 'refused')
        : 'refused'
    if (put === 'outranked') this.noteOutranked(startMs, bytes)
    if (put !== 'stored' && (await this.deleted(scope)) === true) return null
    const home: TraceHome = put === 'stored' ? 'stored' : put === 'outranked' ? 'memory' : 'pending'
    this.remember(scope, trace, home, startMs)
    // Storage answered, so what it refused or could not be reached for earlier is written now.
    if (put === 'stored')
      await this.writePending((key) => key !== memoryKey(scope, trace.activityId))
    return home
  }

  /** Whether storage has already turned away a recording that was no older and no larger. */
  private knownOutranked(startMs: number, bytes: number): boolean {
    const known = this.outranked
    return known !== null && startMs <= known.startMs && bytes >= known.bytes
  }

  private noteOutranked(startMs: number, bytes: number): void {
    const known = this.outranked
    // Keep the one that rules out more: a later start and a smaller size. Incomparable ones keep the first.
    if (known === null || (startMs >= known.startMs && bytes <= known.bytes))
      this.outranked = { startMs, bytes }
  }

  /** Forgets what storage turned away. Called when room may have opened up: at an import's start, or after a removal. */
  forgetOutranked(): void {
    this.outranked = null
  }

  /**
   * Keeps just the trace in memory, for an activity that is not kept in this browser: the ephemeral
   * sample, or the files of a visitor whose account is not known yet.
   */
  captureMemory(activity: Activity, scope: TraceScope): void {
    try {
      if (!activityFitsEntry(activity)) return
      const trace = traceOf(activity)
      if (activityTraceBytes(trace) <= WORKBENCH_ENTRY_BYTES)
        this.remember(scope, trace, 'memory', activity.startMs)
    } catch {
      // Memory evidence is optional too.
    }
  }

  /**
   * Whether a recording is kept for the activity. A memory copy of a stored one counts only while
   * storage still has it. Storage that cannot say holds nothing, unless memory has the trace.
   */
  async holds(scope: TraceScope, activityId: string): Promise<boolean> {
    if (this.deferred.has(memoryKey(scope, activityId))) return true
    const cached = this.traces.get(memoryKey(scope, activityId))
    if (cached !== undefined && cached.home !== 'stored') return true
    const stored = await this.store.has(scope, activityId).catch(() => null)
    return cached === undefined ? stored === true : stored !== false
  }

  /**
   * The ids of the activities whose recordings the scope holds, and when the oldest of them started: those
   * in storage, those waiting for it and those in memory alone, as `holds` counts them. Null when storage
   * cannot say, which a page reads as unknown rather than as none.
   */
  async coverage(
    scope: TraceScope,
  ): Promise<{ ids: string[]; oldestStartMs: number | null } | null> {
    const stored = await this.store.list(scope).catch(() => null)
    if (stored === null) return null
    const found = new Map(stored.map((entry) => [entry.activityId, entry.startMs]))
    const mine = scopeKey(scope)
    // A recording read back from storage is stored, so the list above already has it, with its true start.
    const held = [
      ...this.deferred.values(),
      ...[...this.traces.values()].filter((e) => e.home !== 'stored'),
    ]
    for (const { scope: other, trace, startMs } of held) {
      if (scopeKey(other) === mine) found.set(trace.activityId, startMs)
    }
    const oldestStartMs = [...found.values()].reduce<number | null>(
      (oldest, start) => (oldest === null ? start : Math.min(oldest, start)),
      null,
    )
    return { ids: [...found.keys()], oldestStartMs }
  }

  /** Whether the activity's recording is in storage, as the last write or read left it, so it survives a reload. */
  isStored(scope: TraceScope, activityId: string): boolean {
    return this.traces.get(memoryKey(scope, activityId))?.home === 'stored'
  }

  async get(scope: TraceScope, activityId: string): Promise<ActivityTrace | null> {
    const key = memoryKey(scope, activityId)
    if ((await this.deleted(scope)) === true) {
      this.traces.delete(key)
      return null
    }
    // Held for storage at the end of an import, or for the device if the account is nobody's.
    const waiting = this.deferred.get(key)
    if (waiting !== undefined) return waiting.trace
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
    // Read from storage, so it is never written back and its start does not matter.
    if (trace) this.remember(scope, trace, 'stored', 0)
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
      const saved = await this.store
        .put(entry.scope, entry.trace, entry.startMs)
        .catch((): PutResult => 'refused')
      if (saved === 'refused') continue
      if (this.traces.get(key) !== entry) {
        // It was removed while it was being written, so the write must not bring it back.
        if (saved === 'stored')
          await this.store.remove(entry.scope, entry.trace.activityId).catch(() => false)
      } else entry.home = saved === 'stored' ? 'stored' : 'memory'
    }
  }

  /** Drops per-tab references when a session or account identity changes. */
  clearMemory(): void {
    this.traces.clear()
    this.outranked = null
    this.deferred.clear()
    this.deferredBytes = 0
  }

  /** Drops one memory-only trace, for an activity that was never stored. */
  dropMemory(scope: TraceScope, activityId: string): void {
    this.undefer(memoryKey(scope, activityId))
    this.traces.delete(memoryKey(scope, activityId))
  }

  /** False only when storage refused the removal; storage that cannot be opened holds nothing. */
  async remove(scope: TraceScope, activityId: string): Promise<boolean> {
    this.outranked = null
    this.dropMemory(scope, activityId)
    return await this.store.remove(scope, activityId).catch(() => false)
  }

  async clearScope(scope: TraceScope): Promise<boolean> {
    this.outranked = null
    const owner = scope.kind === 'device' ? 'device' : `account:${scope.userId}`
    for (const [key, entry] of this.traces) {
      if ((entry.scope.kind === 'device' ? 'device' : `account:${entry.scope.userId}`) === owner)
        this.traces.delete(key)
    }
    return await this.store.clearScope(scope).catch(() => false)
  }

  async deleteScope(scope: Extract<TraceScope, { kind: 'account' }>): Promise<boolean> {
    this.outranked = null
    const owner = scope.userId
    for (const [key, entry] of this.traces) {
      if (entry.scope.kind === 'account' && entry.scope.userId === owner) this.traces.delete(key)
    }
    return await this.store.deleteScope(scope).catch(() => false)
  }

  /** Lets the account's scope take recordings again once it is signed in. */
  async reopenScope(scope: Extract<TraceScope, { kind: 'account' }>): Promise<boolean> {
    return await this.store.reopenScope(scope).catch(() => false)
  }

  private remember(
    scope: TraceScope,
    trace: ActivityTrace,
    home: TraceHome,
    startMs: number,
  ): void {
    const key = memoryKey(scope, trace.activityId)
    this.traces.delete(key)
    this.traces.set(key, { scope, trace, home, startMs })
    while (this.traces.size > MEMORY_ENTRIES) {
      const oldest = this.traces.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.traces.delete(oldest)
    }
  }
}
