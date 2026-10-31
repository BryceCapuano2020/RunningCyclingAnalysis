import type { ActivityRecord } from '@rca/contract'
import { visibleRecords } from './hiddenCopies'
import type { WorkerResponse } from './protocol'
import { savedActivityOf } from './savedActivity'

/** Tells the page the saved activities it lists: newest first; records that start together are ordered by id so the list is stable. */
export function reportLibraryActivities(
  savedRecords: ReadonlyMap<string, ActivityRecord>,
  post: (message: WorkerResponse) => void,
): void {
  const records = visibleRecords(savedRecords.values()).sort(
    (a, b) => b.digest.startMs - a.digest.startMs || a.id.localeCompare(b.id),
  )
  post({
    type: 'libraryActivities',
    activities: records.map(({ id, digest }) => savedActivityOf(id, digest)),
  })
}
