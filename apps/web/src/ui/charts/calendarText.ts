import { dayOfCivil, noonOnLabelDate } from '@rca/core/calendar'
import { DAY_MS } from '@rca/core/constants'
import type { YearRow } from '@rca/core/history'
import { formatCount } from '../format/count'
import { formatMonth } from '../format/date'
import { SPORT_ACTIVITY, SPORT_LABEL, SPORT_ORDER, SPORT_PLURAL } from '../sports'
import { keeps } from './calendarGrid'
import type { CalendarCell, CalendarFilter, CalendarGrid, CalendarMode } from './calendarGrid'
import type { ChartTableData, TooltipContent, TooltipRow } from './chartTypes'
import { shortDateWithYear } from './trendTicks'

const hoursText = (hours: number) => `${hours.toFixed(1)} h`

/** The year whose months are named: any would do, and 2018 is the one the layout counts its month columns in. */
const NAMING_YEAR = 2018

/** The short name of a month (0 to 11), in the viewer's language. */
export function monthName(month: number): string {
  return formatMonth(noonOnLabelDate(dayOfCivil(NAMING_YEAR, month, 15) * DAY_MS), false)
}

/** What a cell is called: "Week of 5 May 2019", or "Mar 2023" for a month. */
function cellTitle(cell: CalendarCell, mode: CalendarMode): string {
  return mode === 'weeks'
    ? `Week of ${shortDateWithYear(cell.startDay * DAY_MS)}`
    : formatMonth(noonOnLabelDate(dayOfCivil(cell.year, cell.col, 15) * DAY_MS), true)
}

/** A cell's tooltip: the hours and count of each sport that trained, the total when there are two, and for a month the weeks trained. */
export function tooltipFor(
  cell: CalendarCell | undefined,
  mode: CalendarMode,
  x: number,
  y: number,
): TooltipContent | null {
  if (cell === undefined) return null
  const rows: TooltipRow[] = SPORT_ORDER.filter((sport) => cell.sports[sport].activities > 0).map(
    (sport) => {
      const { hours, activities } = cell.sports[sport]
      const noun = activities === 1 ? SPORT_ACTIVITY[sport] : SPORT_PLURAL[sport]
      return {
        kind: sport,
        label: SPORT_LABEL[sport],
        value: hoursText(hours),
        note: `${formatCount(activities)} ${noun}`,
      }
    },
  )
  if (rows.length === 0) rows.push({ label: 'Training', value: '0 h' })
  if (rows.length > 1) rows.push({ kind: 'neutral', label: 'Total', value: hoursText(cell.hours) })
  if (mode === 'months') {
    rows.push({
      kind: 'neutral',
      label: 'weeks trained',
      value: `${cell.trained} of ${cell.weeks}`,
    })
  }
  return { x, y, title: cellTitle(cell, mode), rows }
}

/** The text twin of the grid: a row for each year and a column for each week of the year, or month, with the hours in it. */
export function tableOf(grid: CalendarGrid, mode: CalendarMode): ChartTableData {
  const byPlace = new Map(grid.cells.map((cell) => [cell.row * grid.columns + cell.col, cell]))
  const heads =
    mode === 'weeks'
      ? Array.from({ length: grid.columns }, (_, c) => String(c + 1))
      : Array.from({ length: grid.columns }, (_, c) => monthName(c))
  return {
    caption: mode === 'weeks' ? 'Hours in each week, by year' : 'Hours in each month, by year',
    columns: ['Year', ...heads],
    rows: grid.years.map((year, row) => [
      String(year),
      ...heads.map((_, col) => {
        const cell = byPlace.get(row * grid.columns + col)
        if (cell === undefined) return ''
        return cell.activities > 0 ? cell.hours.toFixed(1) : '0'
      }),
    ]),
  }
}

/**
 * The hours and activities of each calendar year, whatever the columns are: the figures of Hours per year, for the sports
 * the filter keeps. A week that spans New Year is one cell of the grid, but its days are in two calendar years, so this
 * reads the years the hours chart reads, and the two agree.
 */
export function summaryOf(years: readonly YearRow[], filter: CalendarFilter): ChartTableData {
  return {
    caption: 'Training by year',
    columns: ['Year', 'Hours', 'Activities'],
    rows: years.map((row) => {
      const kept = SPORT_ORDER.filter((sport) => keeps(filter, sport)).map((s) => row.sports[s])
      const hours = kept.reduce((sum, totals) => sum + totals.hours, 0)
      const activities = kept.reduce((sum, totals) => sum + totals.activities, 0)
      return [String(row.year), hours > 0 ? hours.toFixed(1) : '0', formatCount(activities)]
    }),
  }
}
