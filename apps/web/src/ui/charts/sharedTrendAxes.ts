import type { QuietGap } from '@rca/core/digest/trendSeries'
import type { AxisTick, ChartSize } from './chartTypes'
import type { SharedWeek } from './gradeTrend'
import { fitTicks } from './ticks'
import { trendXTicks } from './trendTicks'

/** The x and y axis ticks of a shared trend, each fitted to the chart's width. */
export function axisTicksOf(
  weeks: readonly SharedWeek[],
  x: (value: number) => number,
  y: (value: number) => number,
  ticks: readonly number[],
  decimals: number,
  size: ChartSize,
  gaps: readonly QuietGap[],
): { xTicks: AxisTick[]; yTicks: AxisTick[] } {
  return {
    xTicks: trendXTicks(
      weeks.map((week) => week.endMs),
      x,
      size,
      gaps,
    ),
    yTicks: fitTicks(
      ticks.map((tick) => ({
        position: y(tick),
        label: `${tick.toFixed(decimals)}%`,
      })),
      { axis: 'y', width: size.width },
    ),
  }
}

/** Grade ticks are ten points apart; a narrow chart thins them to fit. */
const GRADE_STEP = 10
/** The room above and below the data on a grade axis, as a fraction of its span, and the least it spans, in points. */
const GRADE_PAD = 0.08
const MIN_GRADE_SPAN = 20

/**
 * The y domain and ticks of a shared trend, fitted to every value it draws, bands included. A grade axis, which is in
 * per cent, runs from a multiple of ten under the data to one over it (never under 0), with a tick every ten points and
 * at least twenty points of span, so a trend between 24 and 78 is drawn on 10 to 90, not 0 to 100.
 */
export function yDomainOf(values: readonly number[]): {
  domain: [number, number]
  ticks: number[]
} {
  // With nothing to fit, the whole scale.
  if (values.length === 0)
    return { domain: [0, 100], ticks: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] }
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max((hi - lo) * GRADE_PAD, 1)
  const low = Math.max(0, Math.floor((lo - pad) / GRADE_STEP) * GRADE_STEP)
  const high = Math.max(Math.ceil((hi + pad) / GRADE_STEP) * GRADE_STEP, low + MIN_GRADE_SPAN)
  const ticks: number[] = []
  for (let tick = low; tick <= high; tick += GRADE_STEP) ticks.push(tick)
  return { domain: [low, high], ticks }
}
