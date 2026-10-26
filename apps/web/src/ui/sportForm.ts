import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { formatDistance } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { plural } from './components/plural'
import { formatDayMonth } from './format/date'
import { SPORT_LABEL, SPORT_PLURAL } from './sports'

/**
 * A sport's recent form in one line: the last activity's day, the number of activities and their
 * total distance, such as "Last run 14 Jan · 2 runs · 15.0 km". The day has no weekday, as a summary
 * line's date does not. The year shows only when the day is not in the year of `nowMs`, the time the
 * page is read at. Null when the sport has none.
 */
export function formLine(
  activities: ActivitySummary[],
  sport: Sport,
  units: UnitSystem,
  nowMs: number,
): string | null {
  const own = activities.filter((activity) => activity.sport === sport)
  if (own.length === 0) return null
  const last = Math.max(...own.map((activity) => activity.startMs))
  const metres = own.reduce((total, activity) => total + activity.distanceM, 0)
  const noun = SPORT_LABEL[sport].toLowerCase()
  return [
    `Last ${noun} ${formatDayMonth(last, nowMs)}`,
    plural(own.length, noun, SPORT_PLURAL[sport]),
    formatDistance(metres, units),
  ].join(' · ')
}
