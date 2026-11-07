import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { formatDistance } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import type { Property } from './components/property'
import { formatDayMonth } from './format/date'
import { SPORT_LABEL } from './sports'

/**
 * A sport's recent form as a detail panel's rows: the last activity's day and the total distance, such as "Last run" and
 * "14 Jan". The day has no weekday, as a summary's date does not. The year shows only when the day is not in the year of
 * `nowMs`, the time the page is read at. No rows when the sport has none. The count is the period's rows', so it is not here.
 */
export function formRows(
  activities: ActivitySummary[],
  sport: Sport,
  units: UnitSystem,
  nowMs: number,
): Property[] {
  const own = activities.filter((activity) => activity.sport === sport)
  if (own.length === 0) return []
  const last = Math.max(...own.map((activity) => activity.startMs))
  const metres = own.reduce((total, activity) => total + activity.distanceM, 0)
  return [
    { label: `Last ${SPORT_LABEL[sport].toLowerCase()}`, value: formatDayMonth(last, nowMs) },
    { label: 'Distance', value: formatDistance(metres, units) },
  ]
}
