import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatClock, groupThousands } from '@rca/core/units'
import { PER } from '../format/units'
import { SPORT_FORMAT } from '../sports'
import type { AxisTick, PlotBox } from './chartTypes'
import { linearScale, niceDomain, tickDecimals } from './scale'
import { labelWidth, rootScale } from './ticks'
import type { Scale } from './scale'

/** Pace steps in seconds: five and ten seconds, quarter, half and whole minutes, then two and five. */
const PACE_STEPS_S = [5, 10, 15, 30, 60, 120, 300]
const INTERVALS = 4
/** Absorbs floating-point noise in a span that should be exactly INTERVALS steps wide. */
const SPAN_TOLERANCE = 1e-9
/** The axis title's size, px at a 16 px root: --text-xs (ChartYAxis.css). */
const AXIS_TITLE_PX = 12

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

/** What a sport's own number is called, in table headings, tooltips and legends. */
export function nativeLabel(sport: Sport): string {
  return SPORT_FORMAT[sport].nativeLabel
}

/**
 * The vertical axis's title. Pace says which way is faster, since its axis runs the other way. `full` spells GAP
 * out, for the first chart a page draws.
 */
export function axisTitle(sport: Sport, units: UnitSystem, full = false): string {
  return SPORT_FORMAT[sport].axisTitle(units, full)
}

/**
 * The axis title spelt out where it fits over the plot, which it starts at the left of, else the short one: on a narrow
 * phone the full title would run past the plot's right edge and be cut off.
 */
export function axisTitleWithin(
  sport: Sport,
  units: UnitSystem,
  plot: PlotBox,
  scale: number = rootScale(),
): string {
  const full = axisTitle(sport, units, true)
  const fits = labelWidth(full, AXIS_TITLE_PX, scale) <= plot.right - plot.left
  return fits ? full : axisTitle(sport, units)
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
  intervals: number,
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
    PACE_STEPS_S.find((candidate) => span / candidate <= intervals + SPAN_TOLERANCE) ?? 300
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
 * little as a minute, so that a few per cent can be seen. `intervals` is how many steps the axis is cut into at most:
 * a small panel asks for fewer.
 */
export function sportYAxis(
  sport: Sport,
  values: number[],
  plot: PlotBox,
  tight = false,
  minTightPaceSpanS = MIN_TIGHT_PACE_SPAN_S,
  intervals = INTERVALS,
): { y: Scale; ticks: AxisTick[] } {
  if (sport === 'run') {
    const { domain, ticks } = paceDomain(
      values,
      tight ? minTightPaceSpanS : MIN_PACE_SPAN_S,
      intervals,
    )
    const y = linearScale(domain, [plot.top, plot.bottom])
    return {
      y,
      ticks: ticks.map((seconds) => ({ position: y(seconds), label: formatClock(seconds) })),
    }
  }
  const { domain, ticks } = niceDomain(
    tight ? values : [0, ...values],
    intervals,
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

/** The most ticks a pace axis fitted to its values draws. */
const CURVE_MAX_TICKS = 6
/** The room above and below the values on that axis, as a fraction of their range. */
const CURVE_PAD = 0.06

/**
 * A pace axis fitted to its values: the domain is their range with a little room, not stretched out to the round
 * numbers around it, and the ticks are the round numbers inside it. A wide range, such as a one minute best against
 * a three hour one, cannot then leave a third of the plot empty above the fastest pace. Faster is up.
 */
function curvePaceAxis(values: number[], plot: PlotBox): { y: Scale; ticks: AxisTick[] } {
  const fat = widened(values, FITTED_MIN_PACE_SPAN_S)
  const [lo, hi] = [Math.min(...fat), Math.max(...fat)]
  const pad = (hi - lo) * CURVE_PAD
  const domain: [number, number] = [lo - pad, hi + pad]
  const count = (step: number) => Math.floor(domain[1] / step) - Math.ceil(domain[0] / step) + 1
  const step =
    PACE_STEPS_S.find((candidate) => count(candidate) <= CURVE_MAX_TICKS) ?? PACE_STEPS_S.at(-1)!
  const y = linearScale(domain, [plot.top, plot.bottom])
  const ticks: AxisTick[] = []
  for (let k = Math.ceil(domain[0] / step); k <= Math.floor(domain[1] / step); k++) {
    ticks.push({ position: y(k * step), label: formatClock(k * step) })
  }
  return { y, ticks }
}

/** The axis of a best curve, by sport: pace fitted to its values, power from zero as the sport page draws it. */
const CURVE_AXIS: Record<
  Sport,
  (values: number[], plot: PlotBox) => { y: Scale; ticks: AxisTick[] }
> = {
  run: curvePaceAxis,
  ride: (values, plot) => sportYAxis('ride', values, plot),
}

/**
 * The vertical scale of a chart of best curves, one for each year: a pace axis fitted to the lines so no tick pulls
 * it out to a round number it does not need, and a power axis from zero. `values` are plotted values, not empty.
 */
export function curveYAxis(
  sport: Sport,
  values: number[],
  plot: PlotBox,
): { y: Scale; ticks: AxisTick[] } {
  return CURVE_AXIS[sport](values, plot)
}
