import { formatDuration } from '@rca/core/units'
import type { AxisTick } from './chartTypes'

/** Below this width, x ticks are capped at four, and axis text is 12 px rather than 13. */
export const NARROW_WIDTH = 480

const CHAR_EM = 0.6
const LABEL_GAP = 8
/** Candidate duration ticks on a log x axis: 1, 5, 10, 20, 30, 60, 120 and 180 minutes. */
const TICK_DURATIONS_S = [60, 300, 600, 1200, 1800, 3600, 7200, 10800]

/** Axis text in px: 13 on a wide chart, and 12 on a narrow one, the smallest that reads comfortably. */
export function axisFontSize(width: number): number {
  return width < NARROW_WIDTH ? 12 : 13
}

/** The candidate duration ticks inside [fromS, toS], placed by x and labelled as durations. */
export function durationTicks(
  fromS: number,
  toS: number,
  x: (durationS: number) => number,
): AxisTick[] {
  return TICK_DURATIONS_S.filter((durationS) => durationS >= fromS && durationS <= toS).map(
    (durationS) => ({ position: x(durationS), label: formatDuration(durationS) }),
  )
}

export interface FitTicksOptions {
  axis: 'x' | 'y'
  width: number
  /** Most ticks wanted on this axis. */
  maxCount?: number
}

/**
 * The ticks that can be drawn without overlapping. Capped at maxCount (four on a narrow x axis),
 * then every other tick is dropped for as long as neighbouring labels would collide.
 */
export function fitTicks(
  ticks: AxisTick[],
  { axis, width, maxCount }: FitTicksOptions,
): AxisTick[] {
  const limit = axis === 'x' && width < NARROW_WIDTH ? Math.min(maxCount ?? 4, 4) : maxCount
  let kept =
    limit !== undefined && ticks.length > limit
      ? every(ticks, Math.ceil(ticks.length / limit))
      : ticks
  const fontPx = axisFontSize(width)
  while (kept.length > 1 && collides(kept, axis, fontPx)) kept = every(kept, 2)
  return kept
}

function every(ticks: AxisTick[], step: number): AxisTick[] {
  return ticks.filter((_, i) => i % step === 0)
}

/** The width of a tick label in pixels, estimated from its length and the font size. */
export function labelWidth(label: string, fontPx: number): number {
  return label.length * fontPx * CHAR_EM
}

function collides(ticks: AxisTick[], axis: 'x' | 'y', fontPx: number): boolean {
  return ticks.some((tick, i) => {
    const next = ticks[i + 1]
    if (next === undefined) return false
    const gap = Math.abs(next.position - tick.position)
    const needed =
      axis === 'x'
        ? (labelWidth(tick.label, fontPx) + labelWidth(next.label, fontPx)) / 2 + LABEL_GAP
        : fontPx + 4
    return gap < needed
  })
}
