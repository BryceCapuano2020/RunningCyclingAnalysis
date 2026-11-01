import type { YearToDate } from '@rca/core/history'
import { DAY_MS } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'
import { distanceUnit, groupThousands } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { formatMonth } from '../format/date'
import type { AxisTick, ChartSize } from './chartTypes'
import { linePath } from './paths'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { fitTicks } from './ticks'
import { YEAR_DAYS, bestPastYear, currentRow, lastOf, todayIndex } from './yearToDateModel'

/** Space between a year's label and its line's end, in px. */
const LABEL_OFFSET_PX = 6
/** Room a label needs to the right of this year's end point, in px: past it, the label sits to the left. */
const LABEL_ROOM_PX = 40

/** One year's line: its SVG path, and whether it is this year, drawn in the sport's colour. */
export interface YearToDateLine {
  year: number
  current: boolean
  d: string
}

/** A year's name at the end of its line. */
export interface YearToDateLabel {
  year: number
  current: boolean
  x: number
  y: number
  anchor: 'start' | 'end'
}

export interface YearToDateLayout {
  /** The pixel x of every sample day, in order; each line is drawn through them. */
  dayXs: number[]
  /** The samples a reader can point to: those up to today, in order. */
  pointXs: number[]
  /** The pixel y of this year at each point, where the tooltip sits. */
  pointYs: number[]
  lines: YearToDateLine[]
  labels: YearToDateLabel[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/**
 * Every year's cumulative distance on the day of the year, with one line for each year and this year's the thick one.
 * The x axis is the day of the year with its months, and the y axis is the distance in the units setting. Null without
 * years.
 */
export function yearToDateLayout(
  data: YearToDate,
  sport: Sport,
  units: UnitSystem,
  size: ChartSize,
): YearToDateLayout | null {
  if (data.years.length === 0) return null
  const { plot, width } = size
  const { metres: perUnit } = distanceUnit(units)
  const x = linearScale([0, YEAR_DAYS], [plot.left, plot.right])
  const dayXs = data.days.map(x)
  const pointCount = todayIndex(data) + 1
  const peak = Math.max(0, ...data.years.map((row) => lastOf(row, sport) / perUnit))
  const { domain, ticks } = niceDomain([0, peak], 3, 0)
  const y = linearScale(domain, [plot.bottom, plot.top])
  const valueY = (metres: number) => y(metres / perUnit)
  const lines = data.years.map((row) => ({
    year: row.year,
    current: row.year === data.today.year,
    d: linePath(row.metres[sport].map((metres, i) => ({ x: dayXs[i]!, y: valueY(metres) }))),
  }))
  const now = currentRow(data)
  const pointYs = now === undefined ? [] : now.metres[sport].map(valueY)
  const labels: YearToDateLabel[] = []
  const best = bestPastYear(data, sport)
  if (best !== undefined) {
    const end = dayXs.at(-1) ?? plot.right
    labels.push({
      year: best.year,
      current: false,
      x: end,
      y: valueY(lastOf(best, sport)) - LABEL_OFFSET_PX,
      anchor: 'end',
    })
  }
  if (now !== undefined) {
    const at = dayXs[pointCount - 1] ?? plot.left
    const onRight = at + LABEL_ROOM_PX <= plot.right
    labels.push({
      year: now.year,
      current: true,
      x: onRight ? at + LABEL_OFFSET_PX : at - LABEL_OFFSET_PX,
      y: valueY(lastOf(now, sport)) - LABEL_OFFSET_PX,
      anchor: onRight ? 'start' : 'end',
    })
  }
  return {
    dayXs,
    pointXs: dayXs.slice(0, pointCount),
    pointYs,
    lines,
    labels,
    xTicks: fitTicks(monthTicks(data.today.year, x), { axis: 'x', width }),
    yTicks: fitTicks(
      ticks.map((tick) => ({
        position: y(tick),
        label: groupThousands(tick.toFixed(tickDecimals(ticks))),
      })),
      { axis: 'y', width },
    ),
  }
}

/** A tick at the first day of each month of the year, labelled with the month's name. */
function monthTicks(year: number, x: (day: number) => number): AxisTick[] {
  return Array.from({ length: 12 }, (_, month) => ({
    position: x((Date.UTC(year, month, 1) - Date.UTC(year, 0, 1)) / DAY_MS),
    label: formatMonth(Date.UTC(year, month, 15, 12), false),
  }))
}
