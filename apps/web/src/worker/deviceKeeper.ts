import type { SyncItem } from '@rca/core/session'
import { workoutKeyOf } from './device'
import { noteWork } from './workerWire'
import type { DeviceActions } from './device'
import type { WorkerResponse } from './protocol'

/**
 * Keeps imported activities in this browser and counts those it could not. A workout is counted once
 * however many copies of it were turned away, and not at all when another copy of it was kept: the
 * results still show, and the page is told the counts.
 */
export function deviceKeeper(device: DeviceActions, post: (message: WorkerResponse) => void) {
  const refused = new Set<string>()
  const leftToNewer = new Set<string>()
  const kept = new Set<string>()
  const unkept = (keys: Set<string>) => [...keys].filter((key) => !kept.has(key)).length
  return {
    /** A sync sink: keeps the activity, or notes why it was not kept. */
    async keep(item: SyncItem): Promise<void> {
      noteWork()
      const key = workoutKeyOf(item.digest)
      const saved = await device.save(item)
      if (saved === 'kept') kept.add(key)
      else (saved === 'newer' ? leftToNewer : refused).add(key)
    },
    /** Tells the page what could not be kept, if anything. */
    report(): void {
      const count = unkept(refused)
      const newer = unkept(leftToNewer)
      if (count > 0 || newer > 0)
        post({ type: 'deviceIssue', issue: 'notSaved', count, ...(newer > 0 ? { newer } : {}) })
    },
  }
}
