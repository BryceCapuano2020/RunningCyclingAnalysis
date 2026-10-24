import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { PACE_UNIT, formatClock, formatPace, formatPower, paceSeconds } from '@rca/core/units'
import type { AxisTick, PlotBox } from './chartTypes'
import { linearScale, niceDomain, tickDecimals } from './scale'
import type { Scale } from './scale'

/** Pace steps in seconds: quarter, half and whole minutes, then two and five. */
const PACE_STEPS_S = [15, 30, 60, 120, 300]
const INTERVALS = 4

/** A value that can be drawn as a pace or a power: a speed in m/s or watts, above zero. */
export function usable(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : NaN
}

/**
 * A sport's own number on its axis: seconds per unit for running, so that a faster pace is a smaller
 * number, and watts for cycling. Running values are speeds in m/s.
 */
export function plottedValue(sport: Sport, value: number, units: UnitSystem): number {
  return sport === 'run' ? paceSeconds(value, units) : value
}

/** A sport's own number as text: the pace with its unit, or the power in watts. */
export function formatNative(sport: Sport, value: number, units: UnitSystem): string {
  return sport === 'run' ? formatPace(value, units) : formatPower(value)
}

/** What a sport's own number is called, in table headings, tooltips and legends. */
export function nativeLabel(sport: Sport): string {
  return sport === 'run' ? 'Grade-adjusted pace' : 'Power'
}

export function axisTitle(sport: Sport, units: UnitSystem): string {
  return sport === 'run' ? `Grade-adjusted pace (${PACE_UNIT[units]})` : 'Power (W)'
}

/** The pace unit spelt out, for a chart's name: "per kilometre" or "per mile". */
export function paceUnitName(units: UnitSystem): string {
  return units === 'imperial' ? 'per mile' : 'per kilometre'
}

/**
 * Whether a sport's chart fills the area under its line. Watts fill down to zero, so the fill means
 * something. Pace does not: its baseline is the slowest pace on the axis, not zero, so a fill would
 * show the axis rather than the effort. Pace charts draw the line alone.
 */
export function fillsArea(sport: Sport): boolean {
  return sport === 'ride'
}

/** Round tick values, in seconds, that cover the values, with the step chosen from PACE_STEPS_S. */
function paceDomain(seconds: number[]): { domain: [number, number]; ticks: number[] } {
  const lo = Math.min(...seconds)
  const hi = Math.max(...seconds)
  const span = hi - lo || 1
  const step = PACE_STEPS_S.find((candidate) => span / candidate <= INTERVALS) ?? 300
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
    ticks: ticks.map((watts) => ({ position: y(watts), label: watts.toFixed(decimals) })),
  }
}
