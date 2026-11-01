import type { YearDistance, YearToDate } from '@rca/core/history'
import { SPORTS } from '@rca/core/types'
import type { Sport } from '@rca/core/types'

/** Today is 1 March of a common year: its 60th day, so a leap year's 1 March is its 61st. */
export const TODAY = { year: 2027, day: 60 }

/** The sample days, as the core part draws them: every seventh day, the last two days, and today. */
export const SAMPLE_DAYS = Array.from(
  new Set([...Array.from({ length: 52 }, (_, i) => (i + 1) * 7), 365, 366, TODAY.day]),
).sort((a, b) => a - b)

/**
 * A year that covers `perDay` metres a day, in hectometres as the part keeps it. A sample reads the same calendar date
 * as today's sample, so in a leap year every day from 1 March on is one day later than its number.
 */
function yearAt(year: number, perDay: Partial<Record<Sport, number>>): YearDistance {
  const reach = year === TODAY.year ? TODAY.day : 366
  const leap = year % 4 === 0
  const dayOf = (day: number) => (leap && day >= TODAY.day ? Math.min(day + 1, 366) : day)
  const hectometres = (day: number, sport: Sport) =>
    Math.round(((perDay[sport] ?? 0) * dayOf(day)) / 100)
  const days = SAMPLE_DAYS.filter((day) => day <= reach)
  return {
    year,
    hectometres: Object.fromEntries(
      SPORTS.map((sport) => [sport, days.map((day) => hectometres(day, sport))]),
    ) as YearDistance['hectometres'],
    toDate: Object.fromEntries(
      SPORTS.map((sport) => [sport, hectometres(TODAY.day, sport)]),
    ) as YearDistance['toDate'],
  }
}

/**
 * A synthetic library of four years. The leap year is read through 1 March as its 61st day. Run has a line for every
 * year, and ride has none in 2024 or 2026. The best past year to date is 2025 for both sports.
 */
export const YEAR_TO_DATE: YearToDate = {
  today: TODAY,
  days: SAMPLE_DAYS,
  years: [
    yearAt(2024, { run: 1000 }),
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
