import type { Sport } from '@rca/core/types'
import { formatClock, groupThousands } from '@rca/core/units'
import type { AxisTick, PlotBox } from './chartTypes'
import { linearScale } from './scale'
import type { Scale } from './scale'

/** How a sport's panel axis is cut and read. */
interface PanelAxisKind {
  /** Tick steps in the plotted unit, smallest first: seconds for a pace, watts for a power. */
  steps: readonly number[]
  /** The least the values span on the axis, given the middle of them: a change smaller than this is drawn as this much. */
  minSpan: (middle: number) => number
  /** Whether the larger value is at the top: a power, where a pace has the smaller (faster) value there. */
  largerUp: boolean
  /** A tick's text. */
  label: (value: number) => string
}

const KIND: Record<Sport, PanelAxisKind> = {
  run: {
    // Half and whole minutes only, so every panel's ticks read in one style.
    steps: [30, 60, 120, 300, 600],
    minSpan: () => 60,
    largerUp: false,
    label: formatClock,
  },
  ride: {
    steps: [5, 10, 20, 50, 100, 200, 500],
    minSpan: (middle) => Math.max(10, 0.1 * middle),
    largerUp: true,
    label: (watts) => groupThousands(String(Math.round(watts))),
  },
}

/** The room kept above and below the values, as a fraction of their span. */
const MARGIN = 0.12
/** A small panel holds two or three tick labels. */
const MIN_TICKS = 2
const MAX_TICKS = 3

/** The multiples of a step that lie inside [lo, hi]. */
function multiplesIn(step: number, lo: number, hi: number): number[] {
  const ticks: number[] = []
  for (let k = Math.ceil(lo / step); k * step <= hi; k++) ticks.push(k * step)
  return ticks
}

/**
 * The ticks of a domain: the smallest step that leaves two or three, so a tight panel gets fine steps and a wide one coarse.
 * Where no step leaves that many, the coarsest that leaves at least two, which the caller thins.
 */
function ticksOf(kind: PanelAxisKind, lo: number, hi: number): number[] {
  const options = kind.steps.map((step) => multiplesIn(step, lo, hi))
  const fits = options.find((ticks) => ticks.length >= MIN_TICKS && ticks.length <= MAX_TICKS)
  return fits ?? options.filter((ticks) => ticks.length >= MIN_TICKS).at(-1) ?? options[0] ?? []
}

/**
 * The vertical scale of one small panel of bests: its domain is its own values with a small margin, never reaching for zero,
 * and its ticks are round values inside that domain, not an edge snapped out to the next one. A pace has faster up and a power
 * higher up. A panel of one value, or of values that differ by less than the sport's least span, is centred on the middle of
 * them at that span. `values` are plotted values, from plottedValue, and not empty.
 */
export function panelAxis(
  sport: Sport,
  values: readonly number[],
  plot: PlotBox,
): { y: Scale; ticks: AxisTick[] } {
  const kind = KIND[sport]
  const low = Math.min(...values)
  const high = Math.max(...values)
  const middle = (low + high) / 2
  const span = Math.max(high - low, kind.minSpan(middle))
  const lo = middle - span / 2 - span * MARGIN
  const hi = middle + span / 2 + span * MARGIN
  const y = linearScale([lo, hi], kind.largerUp ? [plot.bottom, plot.top] : [plot.top, plot.bottom])
  return {
    y,
    ticks: ticksOf(kind, lo, hi).map((value) => ({ position: y(value), label: kind.label(value) })),
  }
}
