import { civilOfDay, dayOfCivil, localDayOf, localDayOfInstant } from '../calendar'
import type { ActivityDigest, Sport } from '../types'
import { HISTORY_SPORTS, perSport } from './sports'
import type { HistoryInput, HistoryPart } from './types'

/** The last day a year can have, a leap year's. Daily arrays are indexed by day of the year, so index 0 is unused. */
const LAST_DAY = 366
const WEEK_DAYS = 7
const WEEKS = 52

/** Metres each sport covered on each day of a year, indexed by day of the year (1 to 366). */
type DailyMetres = Record<Sport, number[]>

/** Today, as the calendar reads it: its year, its day of that year, and its month (0 to 11) and date. */
interface Today {
  year: number
  day: number
  month: number
  date: number
}

/** One calendar year: the distance each sport covered by each sample day, and by the same calendar date as today. */
export interface YearDistance {
  year: number
  /** Cumulative metres at each of `YearToDate.days` the year has reached: every day for a past year, up to today for this one. */
  metres: Record<Sport, number[]>
  /** Cumulative metres through the same calendar date as today, so a leap year is compared by its date, not its day number. */
  toDate: Record<Sport, number>
}

/** Each calendar year's distance by day of the year, for the year-to-date chart. Its lines are drawn through `days`. */
export interface YearToDate {
  /** Today's local year and its day of that year (1 to 366). */
  today: { year: number; day: number }
  /** The sample days in ascending order: every seventh day, a year's last two days, and today. */
  days: number[]
  /** One row for each year from the library's first to this one. Empty without an activity up to this year. */
  years: YearDistance[]
}

const finite = (value: number): number => (Number.isFinite(value) ? value : 0)

/** The local year of a day number, and its day of that year (1 to 366). */
function yearDayOf(day: number): { year: number; day: number } {
  const { year } = civilOfDay(day)
  return { year, day: day - dayOfCivil(year, 0, 1) + 1 }
}

/** The day of a year that a calendar date falls on. A 29 February in a common year is its 28th, not the 1 March after. */
function dayOfYearOn(year: number, month: number, date: number): number {
  const lastDate = dayOfCivil(year, month + 1, 0) - dayOfCivil(year, month, 1) + 1
  return dayOfCivil(year, month, Math.min(date, lastDate)) - dayOfCivil(year, 0, 1) + 1
}

/** Every seventh day, the year's last two days, and today, ascending: the points a line is drawn through. */
function sampleDays(today: number): number[] {
  const weeks = Array.from({ length: WEEKS }, (_, i) => (i + 1) * WEEK_DAYS)
  return [...new Set([...weeks, LAST_DAY - 1, LAST_DAY, today])].sort((a, b) => a - b)
}

/** Cumulative metres through each day in `days`, which are ascending, rounded to whole metres. */
function throughEach(daily: readonly number[], days: readonly number[]): number[] {
  let sum = 0
  let day = 0
  return days.map((through) => {
    for (; day < through; day++) sum += daily[day + 1] ?? 0
    return Math.round(sum)
  })
}

function emptyDaily(): DailyMetres {
  return perSport(() => new Array<number>(LAST_DAY + 1).fill(0))
}

/** Each year's metres by day, for the sports the history holds, leaving out a year after this one. */
function dailyByYear(digests: ActivityDigest[], thisYear: number): Map<number, DailyMetres> {
  const byYear = new Map<number, DailyMetres>()
  for (const digest of digests) {
    if (!HISTORY_SPORTS.includes(digest.sport)) continue
    const { year, day } = yearDayOf(localDayOf(digest))
    if (year > thisYear) continue
    const daily = byYear.get(year) ?? emptyDaily()
    byYear.set(year, daily)
    daily[digest.sport][day] = (daily[digest.sport][day] ?? 0) + finite(digest.distanceM)
  }
  return byYear
}

function yearRowOf(year: number, daily: DailyMetres, days: number[], today: Today): YearDistance {
  const reached = year === today.year ? days.filter((day) => day <= today.day) : days
  const sameDate = dayOfYearOn(year, today.month, today.date)
  return {
    year,
    metres: perSport((sport) => throughEach(daily[sport], reached)),
    toDate: perSport((sport) => throughEach(daily[sport], [sameDate])[0] ?? 0),
  }
}

function build(digests: ActivityDigest[], input: HistoryInput): YearToDate {
  const todayDay = localDayOfInstant(input.nowMs)
  const { year, day } = yearDayOf(todayDay)
  const { month, date } = civilOfDay(todayDay)
  const today: Today = { year, day, month, date }
  const days = sampleDays(day)
  const byYear = dailyByYear(digests, year)
  const first = byYear.size === 0 ? null : Math.min(year, ...byYear.keys())
  const years =
    first === null
      ? []
      : Array.from({ length: year - first + 1 }, (_, i) => {
          const row = first + i
          return yearRowOf(row, byYear.get(row) ?? emptyDaily(), days, today)
        })
  return { today: { year, day }, days, years }
}

/** Today's day is all this part reads of the input, so a remembered answer holds for the whole day. */
const sameDay = (a: HistoryInput, b: HistoryInput): boolean =>
  localDayOfInstant(a.nowMs) === localDayOfInstant(b.nowMs)

export const yearToDate: HistoryPart<YearToDate> = {
  empty: { today: { year: 0, day: 0 }, days: [], years: [] },
  build,
  same: sameDay,
}
