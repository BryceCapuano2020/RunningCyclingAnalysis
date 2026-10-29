import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { PACE_UNIT, formatClock, formatPower, groupThousands } from '@rca/core/units'
import { PER } from '../format/units'
import { SPORT_FORMAT } from '../sports'
import type { AxisTick, PlotBox } from './chartTypes'
import { linearScale, niceDomain, tickDecimals } from './scale'
import type { Scale } from './scale'

/** Pace steps in seconds: five and ten seconds, quarter, half and whole minutes, then two and five. */
const PACE_STEPS_S = [5, 10, 15, 30, 60, 120, 300]
const INTERVALS = 4
/** Absorbs floating-point noise in a span that should be exactly INTERVALS steps wide. */
const SPAN_TOLERANCE = 1e-9

/** A value that can be drawn as a pace or a power: a speed in m/s or watts, above zero. */
export function usable(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : NaN
}

/**
 * A sport's own number on its axis: seconds per unit for running, so that a faster pace is a smaller
 * number, and watts for cycling. Running values are speeds in m/s.
 */
export function plottedValue(sport: Sport, value: number, units: UnitSystem): number {
  return SPORT_FORMAT[sport].plotted(value, units)
}

/** A sport's own number as text: the pace with its unit, or the power in watts. */
export function formatNative(sport: Sport, value: number, units: UnitSystem): string {
  return SPORT_FORMAT[sport].formatted(value, units)
}

/**
 * A value read off the axis, as text: a pace's seconds per unit as a clock and its unit, or a power in watts.
 * For a fitted line, whose value is on the axis's scale and has no speed to format.
 */
export function formatPlotted(sport: Sport, value: number, units: UnitSystem): string {
  return PLOTTED_TEXT[sport](value, units)
}

const PLOTTED_TEXT: Record<Sport, (value: number, units: UnitSystem) => string> = {
  run: (seconds, units) => `${formatClock(seconds)} ${PACE_UNIT[units]}`,
  ride: (watts) => formatPower(watts),
}

/** What a sport's own number is called, in table headings, tooltips and legends. */
export function nativeLabel(sport: Sport): string {
  return SPORT_FORMAT[sport].nativeLabel
}

/** The vertical axis's title. Pace says which way is faster, since its axis runs the other way. */
export function axisTitle(sport: Sport, units: UnitSystem): string {
  return SPORT_FORMAT[sport].axisTitle(units)
}

/** The pace unit spelt out, for a chart's name: "per kilometre" or "per mile". */
export function paceUnitName(units: UnitSystem): string {
  return PER[units]
}

/**
 * Whether a sport's chart fills the area under its line. Watts fill down to zero, so the fill means
 * something. Pace does not: its baseline is the slowest pace on the axis, not zero, so a fill would
 * show the axis rather than the effort. Pace charts draw the line alone.
 */
export function fillsArea(sport: Sport): boolean {
  return SPORT_FORMAT[sport].fillsArea
}

/** A pace axis spans at least this many seconds, so a narrow range is not cut into a wall of ticks. */
const MIN_PACE_SPAN_S = 120
/** A tight pace axis, for a small change, spans at least this many: ticks a quarter minute apart. */
const MIN_TIGHT_PACE_SPAN_S = 60

/**
 * Round tick values, in seconds, that cover the values, with the step chosen from PACE_STEPS_S. The
 * axis spans at least minSpan seconds.
 */
function paceDomain(
  seconds: number[],
  minSpan: number,
): { domain: [number, number]; ticks: number[] } {
  let lo = Math.min(...seconds)
  let hi = Math.max(...seconds)
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2
    lo = mid - minSpan / 2
    hi = mid + minSpan / 2
  }
  const span = hi - lo
  const step =
    PACE_STEPS_S.find((candidate) => span / candidate <= INTERVALS + SPAN_TOLERANCE) ?? 300
  const first = Math.floor(lo / step)
  const last = Math.ceil(hi / step)
  const ticks: number[] = []
  for (let k = first; k <= last; k++) ticks.push(k * step)
  return { domain: [ticks[0] ?? lo, ticks[ticks.length - 1] ?? hi], ticks }
}

/**
 * The vertical scale for a sport's values, and its ticks. Running has faster up, so its pace
 * domain runs down the page; cycling starts at zero so that its area fill has a true baseline.
 * `values` are plotted values, from plottedValue. They must not be empty. A chart of a small change,
 * which has no area to fill, passes `tight`: watts do not start at zero, and a pace axis may span as
 * little as a minute, so that a few per cent can be seen.
 */
export function sportYAxis(
  sport: Sport,
  values: number[],
  plot: PlotBox,
  tight = false,
  minTightPaceSpanS = MIN_TIGHT_PACE_SPAN_S,
): { y: Scale; ticks: AxisTick[] } {
  if (sport === 'run') {
    const { domain, ticks } = paceDomain(values, tight ? minTightPaceSpanS : MIN_PACE_SPAN_S)
    const y = linearScale(domain, [plot.top, plot.bottom])
    return {
      y,
      ticks: ticks.map((seconds) => ({ position: y(seconds), label: formatClock(seconds) })),
    }
  }
  const { domain, ticks } = niceDomain(
    tight ? values : [0, ...values],
    INTERVALS,
    tight ? undefined : 0,
  )
  const y = linearScale(domain, [plot.bottom, plot.top])
  const decimals = tickDecimals(ticks)
  return {
    y,
    ticks: ticks.map((watts) => ({
      position: y(watts),
      label: groupThousands(watts.toFixed(decimals)),
    })),
  }
}

/** The least a fitted pace axis spans, seconds: a change of a few seconds shows, with ticks 10 s apart. */
const FITTED_MIN_PACE_SPAN_S = 30
/** The least a fitted power axis spans, as a fraction of its middle: a few watts in 250 are not a cliff. */
const FITTED_MIN_POWER_SPAN = 0.08
/** The least a fitted axis spans, by sport, given the middle of its values. */
const FITTED_MIN_SPAN: Record<Sport, (middle: number) => number> = {
  run: () => FITTED_MIN_PACE_SPAN_S,
  ride: (middle) => FITTED_MIN_POWER_SPAN * middle,
}

/** The room above and below the data on a fitted axis, as a fraction of its span. */
const FITTED_PAD = 0.15

/** The values with a pair added that widen their range to at least minSpan, about the middle of it. */
function widened(values: number[], minSpan: number): number[] {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  if (hi - lo >= minSpan) return values
  const mid = (lo + hi) / 2
  return [...values, mid - minSpan / 2, mid + minSpan / 2]
}

/**
 * The vertical scale of a trend, fitted to its own values with room round them rather than to a fixed span:
 * a pace axis spans at least FITTED_MIN_PACE_SPAN_S and a power axis at least a few per cent of its middle,
 * so a real change fills the plot and a small one still has an honest height. Neither starts at zero, so the
 * area under a line is a wash, not a measure. `values` are plotted values, from plottedValue, and not empty.
 */
export function fittedYAxis(
  sport: Sport,
  values: number[],
  plot: PlotBox,
): { y: Scale; ticks: AxisTick[] } {
  const middle = (Math.min(...values) + Math.max(...values)) / 2
  const fat = widened(values, FITTED_MIN_SPAN[sport](middle))
  const lo = Math.min(...fat)
  const hi = Math.max(...fat)
  const pad = (hi - lo) * FITTED_PAD
  const padded = [lo - pad, hi + pad]
  return sportYAxis(sport, padded, plot, true, FITTED_MIN_PACE_SPAN_S)
}
