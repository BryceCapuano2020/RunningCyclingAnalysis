import type { ActivityRecord } from '@rca/contract'
import type { DeferredFailure, SyncItem } from '@rca/core/session'
import type { SyncIssueCode } from '@rca/core/session'
import { workoutKeyOf } from './device'

/**
 * The most bytes of original files held back at once. Over it, the oldest are decided with what is known then.
 * Under it (nearly every import) each original is decided once the whole import is read.
 */
export const DEFER_BYTES = 64 * 1024 * 1024

interface Held {
  record: ActivityRecord
  item: SyncItem
}

export interface DeferredOriginalsOptions {
  /** Uploads one original; rejects with the reason it was not kept. */
  upload: (record: ActivityRecord, item: SyncItem) => Promise<void>
  /** The ids of the digests the analysis hides as things stand, for a decision made before the import ends. */
  hiddenNow: () => ReadonlySet<string>
  /** Says why an upload failed, as a code the page words. */
  codeOf: (error: unknown, record: ActivityRecord, item: SyncItem) => SyncIssueCode
  /** Why an original can never be kept (too large), so it is failed at once and its bytes are not held to the end. */
  refuse?: (item: SyncItem) => SyncIssueCode | null
  budgetBytes?: number
}

/**
 * Originals are kept for the shown copy of each workout only (rule R). Which copy is shown is known once every file of
 * the import is read, so an original is held until then and uploaded only if its digest is shown; a hidden copy gets
 * none. The bytes held are bounded: past the budget the oldest are decided at once with the copies known so far,
 * which is the same answer unless a later file turns out to outrank one that was already uploaded.
 */
export class DeferredOriginals {
  private readonly options: DeferredOriginalsOptions
  private readonly held: Held[] = []
  private heldBytes = 0
  private readonly failures: DeferredFailure[] = []

  constructor(options: DeferredOriginalsOptions) {
    this.options = options
  }

  /** Holds an original until the import's copies are known, deciding the oldest early if the budget is passed. */
  async add(record: ActivityRecord, item: SyncItem): Promise<void> {
    const refused = this.options.refuse?.(item) ?? null
    if (refused !== null) {
      this.failures.push({ key: workoutKeyOf(item.digest), code: refused })
      return
    }
    this.held.push({ record, item })
    this.heldBytes += item.bytes.byteLength
    const budget = this.options.budgetBytes ?? DEFER_BYTES
    while (this.heldBytes > budget && this.held.length > 1) {
      const oldest = this.held.shift()!
      this.heldBytes -= oldest.item.bytes.byteLength
      await this.decide(oldest, this.options.hiddenNow())
    }
  }

  /** Decides every original still held, now that the shown copies are known, and says which uploads failed. */
  async finish(hidden: ReadonlySet<string>): Promise<readonly DeferredFailure[]> {
    const rest = this.held.splice(0)
    this.heldBytes = 0
    await Promise.all(rest.map((entry) => this.decide(entry, hidden)))
    return this.failures.splice(0)
  }

  private async decide({ record, item }: Held, hidden: ReadonlySet<string>): Promise<void> {
    if (hidden.has(item.digest.id)) return
    try {
      await this.options.upload(record, item)
    } catch (error) {
      // The digest is saved. Only the original is missing, which says nothing about the network.
      this.failures.push({
        key: workoutKeyOf(item.digest),
        code: this.options.codeOf(error, record, item),
      })
    }
  }
}
