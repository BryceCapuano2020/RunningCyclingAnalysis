import type { ActivityTrace } from '@rca/core/workbench'
import { WORKBENCH_TOTAL_BYTES } from './workbenchStore'
import type { TraceScope } from './workbenchStore'

export interface DeferredTrace {
  scope: TraceScope
  trace: ActivityTrace
  bytes: number
  startMs: number
}

/**
 * Recordings waiting to be stored at the end of an import, by memory key. A bulk import's recordings mostly
 * outnumber what the cache holds, so they are held back and only the newest that fit are written. The held
 * sizes add up to at most the cache's: the oldest are let go to stay within it.
 */
export class DeferredTraces {
  private readonly held = new Map<string, DeferredTrace>()
  private bytes = 0

  has(key: string): boolean {
    return this.held.has(key)
  }

  get(key: string): DeferredTrace | undefined {
    return this.held.get(key)
  }

  values(): IterableIterator<DeferredTrace> {
    return this.held.values()
  }

  /** Holds a recording, replacing one held under the key, and lets the oldest go while over the cache's size. */
  hold(key: string, item: DeferredTrace): void {
    this.release(key)
    this.held.set(key, item)
    this.bytes += item.bytes
    while (this.bytes > WORKBENCH_TOTAL_BYTES) this.dropOldest()
  }

  release(key: string): void {
    const item = this.held.get(key)
    if (item === undefined) return
    this.bytes -= item.bytes
    this.held.delete(key)
  }

  /** Empties the hold, returning what it held, newest first. */
  takeAll(): DeferredTrace[] {
    const items = [...this.held.values()].sort((a, b) => b.startMs - a.startMs)
    this.clear()
    return items
  }

  clear(): void {
    this.held.clear()
    this.bytes = 0
  }

  private dropOldest(): void {
    let oldest: string | undefined
    for (const [key, item] of this.held) {
      if (oldest === undefined || item.startMs < this.held.get(oldest)!.startMs) oldest = key
    }
    if (oldest === undefined) this.bytes = 0
    else this.release(oldest)
  }
}
