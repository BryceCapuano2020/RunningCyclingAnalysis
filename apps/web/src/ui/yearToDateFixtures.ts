import type { YearDistance, YearToDate } from '@rca/core/history'
import type { Sport } from '@rca/core/types'

/** Today is 1 March of a common year: its 60th day, so a leap year's 1 March is its 61st. */
export const TODAY = { year: 2027, day: 60 }

/** The sample days, as the core part draws them: every seventh day, the last two days, and today. */
export const SAMPLE_DAYS = Array.from(
  new Set([...Array.from({ length: 52 }, (_, i) => (i + 1) * 7), 365, 366, TODAY.day]),
).sort((a, b) => a - b)

/**
 * A year that covers `perDay` metres a day: its cumulative distance on each sample day it has reached, which is every
 * day for a past year and today for this one, and its total through `sameDate`, its day of the same calendar date.
 */
function yearAt(
  year: number,
  perDay: Partial<Record<Sport, number>>,
  sameDate = TODAY.day,
): YearDistance {
  const reach = year === TODAY.year ? TODAY.day : 366
  const days = SAMPLE_DAYS.filter((day) => day <= reach)
  const sports: Sport[] = ['run', 'ride']
  return {
    year,
    metres: Object.fromEntries(
      sports.map((sport) => [sport, days.map((day) => Math.round((perDay[sport] ?? 0) * day))]),
    ) as YearDistance['metres'],
    toDate: Object.fromEntries(
      sports.map((sport) => [sport, Math.round((perDay[sport] ?? 0) * sameDate)]),
    ) as YearDistance['toDate'],
  }
}

/**
 * A synthetic library of four years. The leap year is compared through 1 March as its 61st day. Run has a line for
 * every year, and ride has none in 2024 or 2026. The best past year to date is 2025 for both sports.
 */
export const YEAR_TO_DATE: YearToDate = {
  today: TODAY,
  days: SAMPLE_DAYS,
  years: [
    yearAt(2024, { run: 1000 }, 61),
    yearAt(2025, { run: 1500, ride: 500 }),
    yearAt(2026, { run: 1000 }),
    yearAt(2027, { run: 1200 }),
  ],
}

/** A library with only this year, which has no past year to compare it with. */
export const THIS_YEAR_ONLY: YearToDate = {
  today: TODAY,
  days: SAMPLE_DAYS,
  years: [yearAt(2027, { run: 1200 })],
}
