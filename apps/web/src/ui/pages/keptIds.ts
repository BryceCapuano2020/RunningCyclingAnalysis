import { outranks, workoutKey } from '@rca/core/duplicates'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { SavedActivity } from '../../worker/protocol'

/**
 * The library id of the saved copy the analysis keeps for each activity, by activity id. Among the saved
 * copies that start in the same second as an activity (the stored identity of a workout, `workoutKey`), the one that outranks the others by the analysis's own rule. An
 * activity with no saved copy, as with the sample, is absent.
 */
export function keptIdsOf(library: ActivitySummary[], saved: SavedActivity[]): Map<string, string> {
  const kept = new Map<string, SavedActivity>()
  for (const s of saved) {
    const key = workoutKey(s.sport, s.startMs)
    const current = kept.get(key)
    if (current === undefined || outranks(s.copy, current.copy)) kept.set(key, s)
  }
  const ids = new Map<string, string>()
  for (const activity of library) {
    const copy = kept.get(workoutKey(activity.sport, activity.startMs))
    if (copy !== undefined) ids.set(activity.id, copy.id)
  }
  return ids
}
