import type { YearRow, YearTotals } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import { formatDistance } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { formatHoursText } from './activitiesVolume'
import { SPORT_LABEL, SPORT_ORDER } from './sports'

/** One figure of the History page's totals. */
export interface SummaryStat {
  id: string
  label: string
  value: string
  /** The sport whose figure it is, which sets its dot; none for a figure of the whole library. */
  sport?: Sport
}

/** A figure of the years' totals, summed over the years and the sports given. */
function total(
  years: readonly YearRow[],
  sports: readonly Sport[],
  pick: (totals: YearTotals) => number,
): number {
  return years.reduce(
    (sum, row) => sum + sports.reduce((s, sport) => s + pick(row.sports[sport]), 0),
    0,
  )
}

/**
 * The years the library spans, the hours in all of it, and each sport's distance in the athlete's units. A sport with no
 * activity has no distance, so a library of one sport has one.
 */
export function summaryOf(years: readonly YearRow[], units: UnitSystem): SummaryStat[] {
  if (years.length === 0) return []
  const hours = total(years, SPORT_ORDER, (totals) => totals.hours)
  const distances = SPORT_ORDER.filter(
    (sport) => total(years, [sport], (t) => t.activities) > 0,
  ).map((sport): SummaryStat => ({
    id: `distance-${sport}`,
    label: `${SPORT_LABEL[sport]} distance`,
    value: formatDistance(
      total(years, [sport], (t) => t.distanceM),
      units,
    ),
    sport,
  }))
  const label = years.length === 1 ? 'Year on file' : 'Years on file'
  return [
    { id: 'years', label, value: String(years.length) },
    { id: 'hours', label: 'Total hours', value: formatHoursText(hours * 3600) },
    ...distances,
  ]
}
