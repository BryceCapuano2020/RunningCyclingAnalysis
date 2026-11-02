import type { YearToDate } from '@rca/core/history'
import { DAY_MS } from '@rca/core/constants'
import type { Sport } from '@rca/core/types'
import { distanceUnit, groupThousands } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import { formatMonth } from '../format/date'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { spreadApart } from './chartInteraction'
import { linePath } from './paths'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { axisFontSize, fitTicks } from './ticks'
import {
  YEAR_DAYS,
  bestPastYear,
  currentRow,
  lastOf,
  metresOf,
  namedYears,
  todayIndex,
} from './yearToDateModel'

/** Space between a year's label and its line's end, in px. */
const LABEL_OFFSET_PX = 6
/** Room a label needs to the right of this year's end point, in px: past it, the label sits to the left. */
const LABEL_ROOM_PX = 40

/** How far from a line, px, the pointer still picks it. */
const REACH_PX = 14

/** One year's line: its SVG path and the points it passes through, and whether it is this year, drawn in the sport's colour. */
export interface YearToDateLine {
  year: number
  current: boolean
  d: string
  points: Point[]
}

/** Why a year carries its name on the chart: it is this year, the best past year, the one before this, or under the pointer. */
export type LabelRole = 'current' | 'best' | 'previous' | 'read'

/** A year's name at the end of its line. */
export interface YearToDateLabel {
  year: number
  role: LabelRole
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
  const peak = Math.max(0, ...data.years.map((row) => metresOf(lastOf(row, sport)) / perUnit))
  const { domain, ticks } = niceDomain([0, peak], 3, 0)
  const y = linearScale(domain, [plot.bottom, plot.top])
  const valueY = (hectometres: number) => y(metresOf(hectometres) / perUnit)
  const lines = data.years.map((row): YearToDateLine => {
    const points = row.hectometres[sport].map((value, i) => ({ x: dayXs[i]!, y: valueY(value) }))
    return { year: row.year, current: row.year === data.today.year, d: linePath(points), points }
  })
  const now = currentRow(data)
  const pointYs = now === undefined ? [] : now.hectometres[sport].map(valueY)
  const labels = pastLabels(data, sport, lines, axisFontSize(width))
  if (now !== undefined) {
    const at = dayXs[pointCount - 1] ?? plot.left
    const onRight = at + LABEL_ROOM_PX <= plot.right
    labels.push({
      year: now.year,
      role: 'current',
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

/** A line's name at its end: above its last point, ending at it. */
export function endLabelOf(line: YearToDateLine, role: LabelRole): YearToDateLabel {
  const end = line.points.at(-1) ?? { x: 0, y: 0 }
  return { year: line.year, role, x: end.x, y: end.y - LABEL_OFFSET_PX, anchor: 'end' }
}

/**
 * The names of the past years that stand out: the best by today's date and the year before this one, each at the
 * end of its line and kept a line of text apart where their ends are close. The best is named once if it is also the
 * year before.
 */
function pastLabels(
  data: YearToDate,
  sport: Sport,
  lines: readonly YearToDateLine[],
  fontPx: number,
): YearToDateLabel[] {
  const best = bestPastYear(data, sport)?.year
  const labels = namedYears(data, sport)
    .filter((year) => year !== data.today.year)
    .map((year) =>
      endLabelOf(
        lines.find((line) => line.year === year)!,
        year === best ? 'best' : 'previous',
      ),
    )
  const spread = spreadApart(
    labels.map((label) => label.y),
    fontPx + 2,
  )
  // The labels are new here, so their heights are set in place.
  spread.forEach((y, i) => {
    labels[i]!.y = y
  })
  return labels
}

/**
 * The year whose line passes nearest the pointer, within REACH_PX, or null. A line is read where it has a point on
 * each side of the pointer, so this year's stops at today. The later year wins a tie.
 */
export function nearestYear(lines: readonly YearToDateLine[], at: Point): number | null {
  let found: number | null = null
  let reach = REACH_PX
  for (const line of lines) {
    const after = line.points.findIndex((point) => point.x >= at.x)
    const [from, to] = [line.points[after - 1], line.points[after]]
    if (from === undefined || to === undefined) continue
    const y = from.y + ((to.y - from.y) * (at.x - from.x)) / (to.x - from.x)
    if (Math.abs(y - at.y) <= reach) {
      reach = Math.abs(y - at.y)
      found = line.year
    }
  }
  return found
}

/** A tick at the first day of each month of the year, labelled with the month's name. */
function monthTicks(year: number, x: (day: number) => number): AxisTick[] {
  return Array.from({ length: 12 }, (_, month) => ({
    position: x((Date.UTC(year, month, 1) - Date.UTC(year, 0, 1)) / DAY_MS),
    label: formatMonth(Date.UTC(year, month, 15, 12), false),
  }))
}
