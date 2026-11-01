import type { TrainingWeek, WeekCell } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import { SPORT_ORDER } from '../sports'

/** The sports a calendar adds up: every one, or one. */
export type CalendarFilter = Sport | 'all'

/** What a column is: a week of the year, or a month (a phone's, where 53 columns would be too narrow to read). */
export type CalendarMode = 'weeks' | 'months'

/** One cell of the grid: a week, or a month of weeks, of the sports the filter keeps. */
export interface CalendarCell {
  /** Index of the cell's year in the grid's `years`. */
  row: number
  /** The week of the year (from 0), or the month (0 to 11). */
  col: number
  year: number
  /** The day number of the week's Monday, or of the first Monday of the month's weeks. */
  startDay: number
  hours: number
  activities: number
  /** The weeks the cell holds that the library covers: one, or four to five for a month. */
  weeks: number
  /** How many of those weeks had training. */
  trained: number
  /** Hours in an average week of the cell: what its colour shows, so a week and a month share one ramp. */
  rate: number
  /** Each sport's part of the hours and activities, zeros for a sport the filter leaves out. */
  sports: Record<Sport, WeekCell>
}

export interface CalendarGrid {
  /** One row for each year from the first week's to the last's, a year with no training between them included. */
  years: number[]
  columns: number
  /** The cells in order of date: only weeks the library covers, so a week with no training is a cell of zeros. */
  cells: CalendarCell[]
}

/** The most columns of weeks a year has. */
const WEEK_COLUMNS = 53
const MONTH_COLUMNS = 12
const NO_CELL: WeekCell = { hours: 0, activities: 0 }

const add = (a: WeekCell, b: WeekCell): WeekCell => ({
  hours: a.hours + b.hours,
  activities: a.activities + b.activities,
})

/** A record with one entry for each sport, in the app's order. */
function bySport<T>(make: (sport: Sport) => T): Record<Sport, T> {
  return Object.fromEntries(SPORT_ORDER.map((sport) => [sport, make(sport)])) as Record<Sport, T>
}

/**
 * The filter in force: the only sport that trained, or the chosen one, or all of them where the choice is a sport
 * that has no training.
 */
export function filterOf(sports: readonly Sport[], chosen: CalendarFilter): CalendarFilter {
  if (sports.length === 1) return sports[0]!
  return chosen === 'all' || sports.includes(chosen) ? chosen : 'all'
}

/** Whether a filter keeps a sport. */
export const keeps = (filter: CalendarFilter, sport: Sport): boolean =>
  filter === 'all' || filter === sport

/** A week's hours and activities over the sports the filter keeps. */
export const totalOfWeek = (week: TrainingWeek, filter: CalendarFilter): WeekCell =>
  SPORT_ORDER.reduce(
    (sum, sport) => (keeps(filter, sport) ? add(sum, week.sports[sport]) : sum),
    NO_CELL,
  )

/**
 * The grid of a calendar's weeks: a row for each year, and in it a column for each week of the year, or by the
 * month for a phone. A week belongs to the year and month of its Thursday (ISO 8601), so a week that spans New Year
 * is a cell of one year and not two. Empty for no weeks.
 */
export function gridOf(
  weeks: readonly TrainingWeek[],
  filter: CalendarFilter,
  mode: CalendarMode,
): CalendarGrid {
  const first = weeks[0]
  const last = weeks.at(-1)
  if (first === undefined || last === undefined) return { years: [], columns: 0, cells: [] }
  const columnOf = (week: TrainingWeek) => (mode === 'weeks' ? week.number - 1 : week.month)
  // Insertion order is the order of the weeks, so the cells come out in order of date.
  const groups = new Map<number, TrainingWeek[]>()
  for (const week of weeks) {
    const key = (week.year - first.year) * WEEK_COLUMNS + columnOf(week)
    groups.set(key, [...(groups.get(key) ?? []), week])
  }
  const cells = Array.from(groups.values(), (group): CalendarCell => {
    const head = group[0]!
    const sports = bySport((sport) =>
      group.reduce(
        (sum, week) => add(sum, keeps(filter, sport) ? week.sports[sport] : NO_CELL),
        NO_CELL,
      ),
    )
    const total = SPORT_ORDER.reduce((sum, sport) => add(sum, sports[sport]), NO_CELL)
    return {
      row: head.year - first.year,
      col: columnOf(head),
      year: head.year,
      startDay: head.mondayDay,
      ...total,
      weeks: group.length,
      trained: group.filter((week) => totalOfWeek(week, filter).activities > 0).length,
      rate: total.hours / group.length,
      sports,
    }
  })
  return {
    years: Array.from({ length: last.year - first.year + 1 }, (_, i) => first.year + i),
    columns:
      mode === 'months'
        ? MONTH_COLUMNS
        : weeks.some((week) => week.number === WEEK_COLUMNS)
          ? WEEK_COLUMNS
          : WEEK_COLUMNS - 1,
    cells,
  }
}
