import type { ActivityRecord } from '@rca/contract'
import { MODEL_REVISION } from '@rca/core/digest'
import type { WorkerResponse } from './protocol'

/**
 * What the page is told about the saved activities' original files: how many workouts have none,
 * and how many outdated saved activities still have theirs, which are the ones a rebuild can update.
 */
export function originalsReport(
  missingOriginals: ReadonlySet<string>,
  savedRecords: ReadonlyMap<string, ActivityRecord>,
): Extract<WorkerResponse, { type: 'missingOriginals' }> {
  let outdatedWithOriginal = 0
  for (const record of savedRecords.values()) {
    if (record.digest.modelRevision < MODEL_REVISION && record.hasFile) outdatedWithOriginal++
  }
  return { type: 'missingOriginals', count: missingOriginals.size, outdatedWithOriginal }
}
