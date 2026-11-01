import { NO_HISTORY } from '@rca/core/history'
import type { History, YearRow, YearTotals } from '@rca/core/history'

const NONE: YearTotals = { hours: 0, distanceM: 0, climbM: 0, activities: 0 }

/** A year of a synthetic library: what each sport did in it, zeros for a sport left out. */
export function yearRow(year: number, run: Partial<YearTotals> = {}, ride = {}): YearRow {
  return { year, sports: { run: { ...NONE, ...run }, ride: { ...NONE, ...ride } } }
}

/** Three years of both sports, a quiet one between two busy ones. */
export const THREE_YEARS: YearRow[] = [
  yearRow(
    2021,
    { hours: 120, distanceM: 1e6, activities: 90 },
    { hours: 40, distanceM: 8e5, activities: 20 },
  ),
  yearRow(2022, { hours: 30, distanceM: 250_000, activities: 24 }),
  yearRow(
    2023,
    { hours: 80, distanceM: 6e5, activities: 60 },
    { hours: 200, distanceM: 4e6, activities: 100 },
  ),
]

export const historyOfYears = (years: YearRow[]): History => ({ ...NO_HISTORY, years })
