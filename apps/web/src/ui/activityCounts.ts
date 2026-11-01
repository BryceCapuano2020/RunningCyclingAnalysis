import { isAnalysed } from '@rca/core/digest/analysed'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { SessionState } from '@rca/core/session'
import type { Sport } from '@rca/core/types'
import { DEFAULT_VIEW, queryFromView } from './activitiesView'
import { hrefFor } from './route'

/*
 * One count of the library for every page. "On file" is every activity the Activities list holds: what the athlete
 * saved, less the second copy of a workout kept twice. The analysis reads fewer when it leaves out a run at walking
 * pace or an activity the athlete labelled Hike, Walk, a ski or another type. Every page gives the number on file,
 * and says once how many of those it does not count.
 */

export interface LibraryCounts {
  /** Activities on file. */
  onFile: number
  /** Of those, the ones the analysis leaves out. An activity with both causes is counted once. */
  notCounted: number
}

/** Whether the analysis leaves the activity out: walking pace, or a label that is not a run or a ride. */
export function isNotCounted(activity: Pick<ActivitySummary, 'walkingPace' | 'athleteType'>) {
  return !isAnalysed(activity)
}

/** The counts of a library, or of one sport of it. */
export function countsOf(library: readonly ActivitySummary[], sport?: Sport): LibraryCounts {
  let onFile = 0
  let notCounted = 0
  for (const activity of library) {
    if (sport !== undefined && activity.sport !== sport) continue
    onFile++
    if (isNotCounted(activity)) notCounted++
  }
  return { onFile, notCounted }
}

/**
 * The activities on file that started in the period on screen, whether or not the analysis counts them: all of them
 * for all time. The count of the period is out of the count on file, so the two are the same kind of number.
 */
export function startedInPeriod(
  library: readonly ActivitySummary[],
  period: Period,
): ActivitySummary[] {
  const { startMs, endMs } = period
  if (period.days === null && typeof period.choice !== 'object') return [...library]
  if (startMs === null || endMs === null) return []
  return library.filter((activity) => activity.startMs >= startMs && activity.startMs <= endMs)
}

/** The counts of the whole library as the session states them, which is what Balance rests on. */
export function countsOfState(
  state: Pick<SessionState, 'totalActivities' | 'walkingPaceRuns' | 'labelledRuns'>,
): LibraryCounts {
  const notCounted = state.walkingPaceRuns + (state.labelledRuns ?? 0)
  return { onFile: state.totalActivities + notCounted, notCounted }
}

/** The Activities list narrowed to the activities not counted, for the whole library or one sport. */
export function notCountedHref(sport?: Sport): string {
  const query = queryFromView({ ...DEFAULT_VIEW, sport: sport ?? 'all', show: 'not-counted' })
  return `${hrefFor({ page: 'activities' })}?${query}`
}
