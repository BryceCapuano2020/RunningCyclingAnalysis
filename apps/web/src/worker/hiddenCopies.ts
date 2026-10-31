import type { ActivityRecord } from '@rca/contract'
import { copyGroupOf, hiddenDigests } from '@rca/core/duplicates'
import { isAnalysable } from './analysable'
import { workoutKeyOf } from './device'

/**
 * Rule R keeps every distinct start second of a workout, and the analysis shows the best copy of each group (see
 * hiddenDigests). What the library lists, counts and exports is the shown copies, so each of those reads the hidden
 * ones from here.
 */

/** The ids of the saved records that are copies the analysis hides: among the digests it reads, as it reads them. */
export function hiddenRecordIds(records: Iterable<ActivityRecord>): Set<string> {
  const list = [...records].filter(({ digest }) => isAnalysable(digest))
  const hidden = hiddenDigests(list.map(({ digest }) => digest))
  return new Set(list.filter(({ digest }) => hidden.has(digest)).map(({ id }) => id))
}

/** The saved records that are the shown copy of their workout. */
export function visibleRecords(records: Iterable<ActivityRecord>): ActivityRecord[] {
  const list = [...records]
  const hidden = hiddenRecordIds(list)
  return list.filter(({ id }) => !hidden.has(id))
}

/**
 * Every saved record of the same workout as `target` (its near-copies, shown or hidden), `target` first. Deleting
 * the activity the athlete sees removes all of them, or a hidden copy would take its place on the list.
 */
export function copiesOf(
  records: Iterable<ActivityRecord>,
  target: ActivityRecord,
): ActivityRecord[] {
  const list = [...records]
  const group = new Set(
    copyGroupOf(
      list.map(({ digest }) => digest),
      target.digest,
    ),
  )
  return [target, ...list.filter((record) => record !== target && group.has(record.digest))]
}

/**
 * How many of the keys (workouts whose original is missing) belong to a shown copy: a workout kept only as a hidden
 * copy is not missed. A key that a shown record also holds counts, whichever record the key came from.
 */
export function shownCount(keys: ReadonlySet<string>, records: Iterable<ActivityRecord>): number {
  const list = [...records]
  const hidden = hiddenRecordIds(list)
  const shownKeys = new Set<string>()
  const hiddenKeys = new Set<string>()
  for (const record of list)
    (hidden.has(record.id) ? hiddenKeys : shownKeys).add(workoutKeyOf(record.digest))
  let count = 0
  for (const key of keys) if (shownKeys.has(key) || !hiddenKeys.has(key)) count++
  return count
}
