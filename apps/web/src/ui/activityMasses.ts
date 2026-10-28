import type { ActivitySummary } from '@rca/core/pipeline'

/** The body mass in effect on each activity's date, by id. Empty unless the athlete has dated masses. */
export function activityMasses(activities: ActivitySummary[]): Record<string, number> {
  return Object.fromEntries(
    activities.flatMap((activity) =>
      activity.massKg === undefined ? [] : [[activity.id, activity.massKg]],
    ),
  )
}
