import { civilOfDay, localDayOf } from '../calendar'
import { SPORTS } from '../types'
import type { ActivityDigest, Sport } from '../types'
import { activityHours, finite } from './hours'
import { perSport } from './sports'
import { readsDigestsOnly } from './types'
import type { HistoryPart } from './types'

const HOUR_STEP = 100

/** What one sport did in one calendar year. */
export interface YearTotals {
  hours: number
  distanceM: number
  climbM: number
  activities: number
}

/** A calendar year in the athlete's days. A year with no activity, between two that have some, is zeros. */
export interface YearRow {
  year: number
  sports: Record<Sport, YearTotals>
}

const emptyYear = (year: number): YearRow => ({
  year,
  sports: perSport(() => ({ hours: 0, distanceM: 0, climbM: 0, activities: 0 })),
})

/** Every calendar year from the library's first to its last, per sport: hours, distance, climb and activities. */
function build(digests: ActivityDigest[]): YearRow[] {
  const byYear = new Map<number, YearRow>()
  for (const digest of digests) {
    if (!SPORTS.includes(digest.sport)) continue
    const year = civilOfDay(localDayOf(digest)).year
    const row = byYear.get(year) ?? emptyYear(year)
    byYear.set(year, row)
    const totals = row.sports[digest.sport]
    totals.hours += activityHours(digest)
    totals.distanceM += finite(digest.distanceM)
    totals.climbM += finite(digest.elevationGainM)
    totals.activities += 1
  }
  if (byYear.size === 0) return []
  const first = Math.min(...byYear.keys())
  return Array.from({ length: Math.max(...byYear.keys()) - first + 1 }, (_, i) => {
    const row = byYear.get(first + i) ?? emptyYear(first + i)
    for (const sport of SPORTS) {
      const totals = row.sports[sport]
      totals.hours = Math.round(totals.hours * HOUR_STEP) / HOUR_STEP
      totals.distanceM = Math.round(totals.distanceM)
      totals.climbM = Math.round(totals.climbM)
    }
    return row
  })
}

export const years: HistoryPart<YearRow[]> = { empty: [], build, same: readsDigestsOnly }
