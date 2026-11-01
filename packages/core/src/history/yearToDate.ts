import { civilOfDay, dayOfCivil, localDayOf, localDayOfInstant } from '../calendar'
import { SPORTS } from '../types'
import type { ActivityDigest, Sport } from '../types'
import { perSport } from './sports'
import type { HistoryInput, HistoryPart } from './types'

/** The last day a year can have, a leap year's. Daily arrays are indexed by day of the year, so index 0 is unused. */
const LAST_DAY = 366
const WEEK_DAYS = 7
const WEEKS = 52

/** Distances are kept in whole hectometres, a metre count rounded to the nearest 100 m, to keep the payload small. */
export const HECTOMETRE_METRES = 100

/** Metres each sport covered on each day of a year, indexed by day of the year (1 to 366). */
type DailyMetres = Record<Sport, number[]>

/** Today, as the calendar reads it: its year, its day of that year, and its month (0 to 11) and date. */
interface Today {
  year: number
  day: number
  month: number
  date: number
}

/** A sample day of today's year, with the calendar date it falls on. */
interface Sample {
  day: number
  month: number
  date: number
}

/** One calendar year's distance, in hectometres, for the sample days of today's year and for today's calendar date. */
export interface YearDistance {
  year: number
  /**
   * Cumulative hectometres through the calendar date of each sample the year has reached: every sample for a past year,
   * up to today for this one. A sample is read at the same calendar date in every year, so a leap year's 1 March is
   * read through 1 March, not through the day that falls on 1 March in a common year.
   */
  hectometres: Record<Sport, number[]>
  /** Cumulative hectometres through the same calendar date as today: the entry of `hectometres` at today's sample. */
  toDate: Record<Sport, number>
}

/** Each calendar year's distance by sample day, for the year-to-date chart. Its lines are drawn through `days`. */
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

/** Each sample day of today's year with its calendar date. A day past this year's end reads as its last day. */
function samplesOf(year: number, days: number[]): Sample[] {
  const start = dayOfCivil(year, 0, 1)
  const length = dayOfCivil(year + 1, 0, 1) - start
  return days.map((day) => {
    const { month, date } = civilOfDay(start + Math.min(day, length) - 1)
    return { day, month, date }
  })
}

/** Cumulative hectometres through each day in `days`, which are ascending, each rounded to the nearest 100 m. */
function hectometresThrough(daily: readonly number[], days: readonly number[]): number[] {
  let sum = 0
  let day = 0
  return days.map((through) => {
    for (; day < through; day++) sum += daily[day + 1] ?? 0
    return Math.round(sum / HECTOMETRE_METRES)
  })
}

function emptyDaily(): DailyMetres {
  return perSport(() => new Array<number>(LAST_DAY + 1).fill(0))
}

/** Each year's metres by day, for the sports the history holds, leaving out a year after this one. */
function dailyByYear(digests: ActivityDigest[], thisYear: number): Map<number, DailyMetres> {
  const byYear = new Map<number, DailyMetres>()
  for (const digest of digests) {
    if (!SPORTS.includes(digest.sport)) continue
    const { year, day } = yearDayOf(localDayOf(digest))
    if (year > thisYear) continue
    const daily = byYear.get(year) ?? emptyDaily()
    byYear.set(year, daily)
    daily[digest.sport][day] = (daily[digest.sport][day] ?? 0) + finite(digest.distanceM)
  }
  return byYear
}

function yearRowOf(
  year: number,
  daily: DailyMetres,
  samples: Sample[],
  today: Today,
): YearDistance {
  const reached =
    year === today.year ? samples.filter((sample) => sample.day <= today.day) : samples
  const through = reached.map((sample) => dayOfYearOn(year, sample.month, sample.date))
  const sameDate = dayOfYearOn(year, today.month, today.date)
  return {
    year,
    hectometres: perSport((sport) => hectometresThrough(daily[sport], through)),
    toDate: perSport((sport) => hectometresThrough(daily[sport], [sameDate])[0] ?? 0),
  }
}

/** The answer for a library with nothing in it: no days to sample and no years. */
const EMPTY: YearToDate = { today: { year: 0, day: 0 }, days: [], years: [] }

function build(digests: ActivityDigest[], input: HistoryInput): YearToDate {
  if (digests.length === 0) return EMPTY
  const todayDay = localDayOfInstant(input.nowMs)
  const { year, day } = yearDayOf(todayDay)
  const { month, date } = civilOfDay(todayDay)
  const today: Today = { year, day, month, date }
  const days = sampleDays(day)
  const samples = samplesOf(year, days)
  const byYear = dailyByYear(digests, year)
  const first = byYear.size === 0 ? null : Math.min(year, ...byYear.keys())
  const years =
    first === null
      ? []
      : Array.from({ length: year - first + 1 }, (_, i) => {
          const row = first + i
          return yearRowOf(row, byYear.get(row) ?? emptyDaily(), samples, today)
        })
  return { today: { year, day }, days, years }
}

/** Today's day is all this part reads of the input, so a remembered answer holds for the whole day. */
const sameDay = (a: HistoryInput, b: HistoryInput): boolean =>
  localDayOfInstant(a.nowMs) === localDayOfInstant(b.nowMs)

export const yearToDate: HistoryPart<YearToDate> = {
  empty: EMPTY,
  build,
  same: sameDay,
}
