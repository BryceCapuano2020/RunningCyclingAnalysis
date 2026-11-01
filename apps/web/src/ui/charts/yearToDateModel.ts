import { HECTOMETRE_METRES } from '@rca/core/history'
import type { YearDistance, YearToDate } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import { shortDate } from './trendTicks'

/** The days a year runs to, a leap year's last. The chart's day axis runs from 0 to this, so a day is its own end. */
export const YEAR_DAYS = 366

/** This year's row, which ends the rows. Undefined only for a library with no activity up to this year. */
export function currentRow(data: YearToDate): YearDistance | undefined {
  return data.years.find((row) => row.year === data.today.year)
}

/** A distance in hectometres, as the part keeps it, in metres. */
export const metresOf = (hectometres: number): number => hectometres * HECTOMETRE_METRES

/**
 * The hectometres a year has reached at its last sample: its whole year for a past year, its total so far for this one.
 */
export function lastOf(row: YearDistance, sport: Sport): number {
  return row.hectometres[sport].at(-1) ?? 0
}

/** Whether any year has distance in a sport, so the chart has a line to draw for it. */
export function hasDistance(data: YearToDate, sport: Sport): boolean {
  return data.years.some((row) => lastOf(row, sport) > 0)
}

/** The sport the chart opens on: the first of `sports` with any distance, or the first of them when none has. */
export function defaultSport(data: YearToDate, sports: readonly Sport[]): Sport {
  return sports.find((sport) => hasDistance(data, sport)) ?? sports[0]!
}

/**
 * The past year with the most distance by today's calendar date, the later one on a tie. Undefined when no past year
 * has any distance by then, so there is no year to compare this one with.
 */
export function bestPastYear(data: YearToDate, sport: Sport): YearDistance | undefined {
  let best: YearDistance | undefined
  for (const row of data.years) {
    if (row.year >= data.today.year) continue
    const value = row.toDate[sport]
    if (value > 0 && (best === undefined || value >= best.toDate[sport])) best = row
  }
  return best
}

/** Where today is among the sample days: the last point a reader can point to. */
export function todayIndex(data: YearToDate): number {
  return data.days.indexOf(data.today.day)
}

/** A day of this year's calendar, such as "1 Mar", by its day of the year. */
export function dayLabel(data: YearToDate, day: number): string {
  return shortDate(Date.UTC(data.today.year, 0, day))
}
