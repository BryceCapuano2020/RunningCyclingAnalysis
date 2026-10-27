import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatClock, groupThousands } from '@rca/core/units'
import { PER } from '../format/units'
import { SPORT_FORMAT } from '../sports'
import type { AxisTick, PlotBox } from './chartTypes'
import { linearScale, niceDomain, tickDecimals } from './scale'
import type { Scale } from './scale'

/** Pace steps in seconds: quarter, half and whole minutes, then two and five. */
const PACE_STEPS_S = [15, 30, 60, 120, 300]
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

/** Round tick values, in seconds, that cover the values, with the step chosen from PACE_STEPS_S. */
function paceDomain(seconds: number[]): { domain: [number, number]; ticks: number[] } {
  let lo = Math.min(...seconds)
  let hi = Math.max(...seconds)
  if (hi - lo < MIN_PACE_SPAN_S) {
    const mid = (lo + hi) / 2
    lo = mid - MIN_PACE_SPAN_S / 2
    hi = mid + MIN_PACE_SPAN_S / 2
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
 * `values` are plotted values, from plottedValue. They must not be empty.
 */
export function sportYAxis(
  sport: Sport,
  values: number[],
  plot: PlotBox,
): { y: Scale; ticks: AxisTick[] } {
  if (sport === 'run') {
    const { domain, ticks } = paceDomain(values)
    const y = linearScale(domain, [plot.top, plot.bottom])
    return {
      y,
      ticks: ticks.map((seconds) => ({ position: y(seconds), label: formatClock(seconds) })),
    }
  }
  const { domain, ticks } = niceDomain([0, ...values], INTERVALS, 0)
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
