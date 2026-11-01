import { dayOfCivil } from '@rca/core/calendar'
import { monthName } from './calendarText'
import type { CalendarGrid, CalendarMode } from './calendarGrid'
import type { ChartSize } from './chartTypes'
import { PLOT_MARGIN, geometryScale, isPhoneWidth, plotBoxOf } from './plotBox'
import { DEFAULT_ROOT_PX, readRoot } from './rootFont'
import { axisFontSize, labelWidth } from './ticks'

/** The width, px, below which the columns are months: 53 weeks would be cells under 8 px across. */
export const CALENDAR_MONTHS_BELOW_PX = 560

/** The surface showing between two cells. */
const GAP_PX = 2
/** The shortest and tallest a row is, px: squares where there is the width, and a row that still takes a year label. */
const MIN_ROW_PX = 14
const MAX_ROW_PX = 20
/** The plot's bottom margin: the grid ends there, with no axis under it. */
export const CALENDAR_BOTTOM_PX = 6
/** How far a month label's baseline sits above the plot, px. */
export const LABEL_RISE_PX = 8
/** How far a year label ends to the left of the plot, px. */
export const YEAR_GAP_PX = 6
/** The columns of weeks the row height is measured at, as the widest year has. */
const WEEK_COLUMNS = 53
const MONTH_COLUMNS = 12
/** Months narrower than this, px, are named by their first letter. */
const INITIAL_BELOW_PX = 28
/** The room kept between two month labels, px. */
const LABEL_GAP_PX = 4

/** What a chart this wide shows in its columns. */
export const modeOf = (width: number): CalendarMode =>
  width < CALENDAR_MONTHS_BELOW_PX ? 'months' : 'weeks'

/** The height of a row at this width: as tall as a column is wide, within limits. It grows with the reader's text. */
function rowPx(width: number, mode: CalendarMode): number {
  const box = plotBoxOf(width, 0, undefined, CALENDAR_BOTTOM_PX, isPhoneWidth(width))
  const columns = mode === 'months' ? MONTH_COLUMNS : WEEK_COLUMNS
  const scale = geometryScale()
  return Math.min(
    MAX_ROW_PX * scale,
    Math.max(MIN_ROW_PX * scale, (box.right - box.left) / columns),
  )
}

/** The height of the whole chart, px: the room above the plot for the month names, a row for each year, and a margin under. */
export function calendarHeight(rows: number, width: number, mode: CalendarMode): number {
  return (PLOT_MARGIN.top + CALENDAR_BOTTOM_PX) * geometryScale() + rows * rowPx(width, mode)
}

/**
 * The first column, counting from 0, of each month in a year of 53 weeks laid out from a Monday (2018 began on
 * one): the first week whose Thursday is in the month, which is the week a month's cell takes.
 */
export const MONTH_START_COLUMNS: readonly number[] = Array.from({ length: 12 }, (_, month) => {
  const dayOfYear = dayOfCivil(2018, month, 1) - dayOfCivil(2018, 0, 1) + 1
  return Math.max(0, Math.ceil((dayOfYear - 4) / 7))
})

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface CalendarLayout {
  /** The drawn square of each cell of the grid, in the grid's order. */
  rects: Rect[]
  /** The pixel centre of each cell, which a tooltip is anchored at and the keys step through. */
  xs: number[]
  ys: number[]
  months: { x: number; text: string; anchor: 'start' | 'middle' }[]
  years: { y: number; text: string }[]
  /** The index of the cell under a pixel of the plot, or null for none. */
  cellAt: (x: number, y: number) => number | null
}

/** Where each cell, month name and year name goes. A cell fills its place less a 2 px gap, so no dead pixels sit between cells. */
export function calendarLayout(
  grid: CalendarGrid,
  size: ChartSize,
  mode: CalendarMode,
): CalendarLayout {
  const { plot, width } = size
  const pitchX = (plot.right - plot.left) / grid.columns
  const pitchY = (plot.bottom - plot.top) / grid.years.length
  const rects = grid.cells.map((cell) => ({
    x: plot.left + cell.col * pitchX + GAP_PX / 2,
    y: plot.top + cell.row * pitchY + GAP_PX / 2,
    width: pitchX - GAP_PX,
    height: pitchY - GAP_PX,
  }))
  const place = new Map(grid.cells.map((cell, i) => [cell.row * grid.columns + cell.col, i]))
  const font = axisFontSize(width)
  const root = readRoot()
  const textWidth = (text: string) => labelWidth(text, font, root.px / DEFAULT_ROOT_PX, root)
  const wide = pitchX >= INITIAL_BELOW_PX * geometryScale()
  const named = (month: number) =>
    mode === 'months' && !wide ? monthName(month).charAt(0) : monthName(month)
  let clear = -Infinity
  const months = Array.from({ length: 12 }, (_, month) => {
    const anchor: 'start' | 'middle' = mode === 'weeks' ? 'start' : 'middle'
    const column = mode === 'weeks' ? MONTH_START_COLUMNS[month]! : month
    const x = plot.left + column * pitchX + (mode === 'weeks' ? GAP_PX / 2 : pitchX / 2)
    return { x, text: named(month), anchor }
  }).filter(({ x, text, anchor }) => {
    // Weeks put a name at the edge of its first column, and a name that would run into the last one is left out.
    const left = anchor === 'start' ? x : x - textWidth(text) / 2
    if (left < clear) return false
    clear = left + textWidth(text) + LABEL_GAP_PX
    return true
  })
  return {
    rects,
    xs: rects.map((r) => r.x + r.width / 2),
    ys: rects.map((r) => r.y + r.height / 2),
    months,
    years: grid.years.map((year, row) => ({
      y: plot.top + (row + 0.5) * pitchY,
      text: String(year),
    })),
    cellAt: (x, y) => {
      const col = Math.floor((x - plot.left) / pitchX)
      const row = Math.floor((y - plot.top) / pitchY)
      if (col < 0 || col >= grid.columns || row < 0 || row >= grid.years.length) return null
      return place.get(row * grid.columns + col) ?? null
    },
  }
}
