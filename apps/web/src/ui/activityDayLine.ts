import type { ActivitySummary } from '@rca/core/pipeline'
import { formatDay, formatTimeOfDay } from './format/date'
import { SPORT_LABEL } from './sports'

/** The one line under an activity's title: its sport, day and start time, as "Ride · Sat 8 Nov, 12:14". */
export function activityDayLine(activity: ActivitySummary): string {
  return `${SPORT_LABEL[activity.sport]} · ${formatDay(activity.startMs)}, ${formatTimeOfDay(activity.startMs)}`
}
