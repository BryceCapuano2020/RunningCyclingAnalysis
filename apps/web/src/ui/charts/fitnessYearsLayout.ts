import { WEEK_ORIGIN_MS } from '@rca/core/calendar'
import { DAY_MS } from '@rca/core/constants'
import type { FitnessDots } from '@rca/core/history'
import { quantileSorted } from '@rca/core/math'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { SPORT_FORMAT } from '../sports'
import type { AxisTick, ChartSize, Point } from './chartTypes'
import { linearScale } from './scale'
import { fittedYAxis, plottedValue } from './sportAxis'
import { fitTicks } from './ticks'

/** The days between two points of the middle line, as the core draws it. */
const LINE_STEP_DAYS = 28
/** A diamond's half-width in px: a ride's point, a little larger than a run's dot (3 px across half) so the two cover the same area. */
const DIAMOND_R = 4
/** The room the plot keeps at its two ends, so the first and last point are whole. */
export const EDGE_PX = DIAMOND_R

const round1 = (value: number): number => Math.round(value * 10) / 10

/** The day (whole days from the look-back's Monday origin) a calendar year starts on. */
const yearStartDay = (year: number): number => (Date.UTC(year, 0, 1) - WEEK_ORIGIN_MS) / DAY_MS

/** The day of each dot: the first dot's, then the days each dot is from the one before. */
export function daysOf(dots: Pick<FitnessDots, 'firstDay' | 'gaps'>): number[] {
  const days = new Array<number>(dots.gaps.length)
  let day = dots.firstDay
  for (let i = 0; i < days.length; i++) {
    day += dots.gaps[i]!
    days[i] = day
  }
  return days
}

/** A dot's value in the sport's own unit: m/s for a run, watts for a ride. */
export const outputOf = (dots: FitnessDots, steps: number): number => steps * dots.step

export interface SpanBox {
  kind: 'slip' | 'rise'
  x0: number
  x1: number
}

export interface FitnessYearsLayout {
  /** Every dot as one path: a point of zero length with a round cap for a run, a closed diamond for a ride. */
  dots: string
  /** The middle line, a null where the core had too few dots to say, so the pen lifts there. */
  line: (Point | null)[]
  spans: SpanBox[]
  /** The pixel x of the middle of each year's room, in the order the arrow keys step through the years. */
  xs: number[]
  /** Each year's room on the plot, for the band drawn behind the year that is read. */
  rooms: { x0: number; x1: number }[]
  /** Where each year's tooltip sits: its middle, or the plot's middle for a year with no dots. */
  ys: number[]
  xTicks: AxisTick[]
  yTicks: AxisTick[]
}

/** A diamond of half-width r on (x, y) as a closed subpath, every vertex rounded to a tenth of a pixel. */
const diamond = (x: number, y: number): string =>
  `M${x} ${round1(y - DIAMOND_R)}L${round1(x + DIAMOND_R)} ${y}L${x} ${round1(y + DIAMOND_R)}L${round1(x - DIAMOND_R)} ${y}Z`

/** The dots as a path: one subpath for each, so the drawing is one node however many there are. */
function dotsPath(points: readonly Point[], glyph: 'dot' | 'diamond'): string {
  const parts = new Array<string>(points.length)
  for (let i = 0; i < points.length; i++) {
    const [x, y] = [round1(points[i]!.x), round1(points[i]!.y)]
    parts[i] = glyph === 'dot' ? `M${x} ${y}h0` : diamond(x, y)
  }
  return parts.join('')
}

/** Past this many dots a few strays are left to the edge of the plot rather than stretching the axis to them. */
const TRIM_FROM = 100
/** The part of the dots, at each end, that may sit past the axis once there are `TRIM_FROM` of them. */
const TRIM = 0.01

/**
 * The values the vertical axis is fitted to: all of them for a short library, and from the 1st to the 99th percentile
 * for a long one, so that one run read wrong, or a few, do not squeeze the years into a band. A dot past the axis is
 * drawn at its edge (see `fitnessYearsLayout`); its value is whole in the tooltip and the table.
 */
function axisValues(values: readonly number[]): [number, number] {
  const sorted = Float64Array.from(values).sort()
  return values.length < TRIM_FROM
    ? [sorted[0]!, sorted[sorted.length - 1]!]
    : [quantileSorted(sorted, TRIM), quantileSorted(sorted, 1 - TRIM)]
}

/**
 * Where the dots, the middle line, the slips and rises and the years sit on a plot. Time runs left to right from the
 * first dot to the last, each year has its room in proportion to its days, and the vertical axis is fitted to the dots
 * (faster up for a run). Null without a dot.
 */
export function fitnessYearsLayout(
  dots: FitnessDots,
  sport: Sport,
  units: UnitSystem,
  size: ChartSize,
): FitnessYearsLayout | null {
  if (dots.levels.length === 0) return null
  const { plot, width } = size
  const days = daysOf(dots)
  const from = days[0]!
  const to = Math.max(days[days.length - 1]!, from + 1)
  const x = linearScale([from, to], [plot.left + EDGE_PX, plot.right - EDGE_PX])
  const plotted = dots.levels.map((steps) => plottedValue(sport, outputOf(dots, steps), units))
  const { y, ticks } = fittedYAxis(sport, [...axisValues(plotted)], plot)
  const [top, bottom] = [plot.top + EDGE_PX, plot.bottom - EDGE_PX]
  const onPlot = (value: number) => Math.min(bottom, Math.max(top, y(value)))
  const glyph = SPORT_FORMAT[sport].glyph
  const points = days.map((day, i) => ({ x: x(day), y: onPlot(plotted[i]!) }))
  const line = dots.line.map((steps, k) =>
    steps === null
      ? null
      : {
          x: x(from + k * LINE_STEP_DAYS),
          y: onPlot(plottedValue(sport, outputOf(dots, steps), units)),
        },
  )
  // A span is drawn from where it began to where it ended, or the look-back's horizon while it lasts, within the plot.
  const horizon = dots.horizonDay ?? to
  const spans = dots.spans.flatMap(({ kind, fromDay, toDay }): SpanBox[] => {
    const [a, b] = [Math.max(fromDay, from), Math.min(toDay ?? horizon, to)]
    return b > a ? [{ kind, x0: x(a), x1: x(b) }] : []
  })
  const rooms = dots.years.map(({ year }) => ({
    x0: x(Math.max(yearStartDay(year), from)),
    x1: x(Math.min(yearStartDay(year + 1), to)),
  }))
  const xs = rooms.map((room) => (room.x0 + room.x1) / 2)
  return {
    dots: dotsPath(points, glyph),
    line,
    spans,
    xs,
    rooms,
    ys: dots.years.map((year) =>
      year.n === 0
        ? (plot.top + plot.bottom) / 2
        : onPlot(plottedValue(sport, outputOf(dots, year.median), units)),
    ),
    xTicks: fitTicks(
      dots.years.map((year, i) => ({ position: xs[i]!, label: String(year.year) })),
      { axis: 'x', width },
    ),
    yTicks: fitTicks(ticks, { axis: 'y', width }),
  }
}
