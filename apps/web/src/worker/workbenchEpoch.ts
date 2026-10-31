import type { ActivityTrace } from '@rca/core/workbench'
import type { PutResult, TraceScope, WorkbenchStore } from './workbenchStore'

/**
 * Keeps the device scope's recordings from outliving the library they belong to. The session reads the
 * scope's epoch when it loads the library kept in this browser; every device recording it writes carries
 * that epoch, and storage refuses one written after the scope was cleared (in this tab or another). Once
 * one is refused, the import it belongs to is over and `replaced` says so.
 */
export class DeviceEpoch {
  private epoch: number | null = null
  private refused = false

  private readonly store: () => WorkbenchStore

  constructor(store: () => WorkbenchStore) {
    this.store = store
  }

  /** Reads the epoch the session now writes under. Until it is known, device recordings are not persisted. */
  async watch(): Promise<void> {
    this.refused = false
    this.epoch = null
    this.epoch = await this.store()
      .deviceEpoch()
      .catch(() => null)
  }

  /**
   * The epoch a device write carries, or null while it is not known: before the first read, or when storage
   * would not say. A device recording is then kept in memory for the visit and not written, since a write with
   * no epoch to check could put a recording back into a library another tab has emptied.
   */
  get current(): number | null {
    return this.epoch
  }

  /** Writes a recording. A device recording goes only under a known epoch, or it could outlive its library. */
  async put(scope: TraceScope, trace: ActivityTrace, startMs: number): Promise<PutResult> {
    const epoch = scope.kind === 'device' ? this.epoch : undefined
    if (epoch === null) return 'refused'
    const put = await this.store()
      .put(scope, trace, startMs, epoch)
      .catch((): PutResult => 'refused')
    this.note(put)
    return put
  }

  /** Notes a storage answer; true when the scope was cleared under the writer. */
  note(result: PutResult): boolean {
    if (result === 'replaced') this.refused = true
    return result === 'replaced'
  }

  /** Whether a recording was refused since the epoch was read. */
  get replaced(): boolean {
    return this.refused
  }
}
