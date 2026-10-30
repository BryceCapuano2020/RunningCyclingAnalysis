import { formatDuration } from '@rca/core/units'
import type { AxisTick } from './chartTypes'
import { PHONE_CHART_WIDTH } from './plotBox'
import { DEFAULT_ROOT_PX, readRoot, rootFontPx, textEm } from './rootFont'
import type { RootText } from './rootFont'

/** Below this width, x ticks are capped at four, and axis text is 12 px rather than 13. */
export const NARROW_WIDTH = PHONE_CHART_WIDTH

const LABEL_GAP = 8
/** Candidate duration ticks on a log x axis: 1, 5, 10, 20, 30, 60, 120 and 180 minutes. */
const TICK_DURATIONS_S = [60, 300, 600, 1200, 1800, 3600, 7200, 10800]

/** Axis text in px: 13 on a wide chart, and 12 on a narrow one, the smallest that reads comfortably. */
export function axisFontSize(width: number): number {
  return width < NARROW_WIDTH ? 12 : 13
}

/**
 * An axis text size in rem, for the tick labels' style: the layout still measures the px size, but the
 * drawn text follows the reader's own text size.
 */
export function axisFontRem(px: number): string {
  return `${px / DEFAULT_ROOT_PX}rem`
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
  /** A tick that must stay, such as the zero line, even where the others are thinned away. */
  keep?: (tick: AxisTick) => boolean
}

/**
 * The ticks that can be drawn without overlapping. Capped at maxCount (four on a narrow x axis),
 * then every other tick is dropped for as long as neighbouring labels would collide.
 */
export function fitTicks(
  ticks: AxisTick[],
  { axis, width, maxCount, keep = () => false }: FitTicksOptions,
): AxisTick[] {
  const limit = axis === 'x' && width < NARROW_WIDTH ? Math.min(maxCount ?? 4, 4) : maxCount
  let kept =
    limit !== undefined && ticks.length > limit
      ? every(ticks, Math.ceil(ticks.length / limit), keep)
      : ticks
  // The root is read once for the whole fit, not once per label it measures.
  const fontPx = axisFontSize(width)
  const root = readRoot()
  const scale = root.px / DEFAULT_ROOT_PX
  while (kept.length > 1 && collides(kept, axis, fontPx, scale, root)) {
    const next = every(kept, 2, keep)
    if (next.length < kept.length) {
      kept = next
      continue
    }
    // Thinning made no progress: drop the ticks that are not kept, and if the kept ones still collide
    // drop the earliest, so the latest stays and every pass shortens the list.
    const must = kept.filter(keep)
    kept = must.length < kept.length ? must : kept.slice(1)
  }
  return kept
}

/** Every `step`th tick, plus any the caller keeps. */
function every(ticks: AxisTick[], step: number, keep: (tick: AxisTick) => boolean): AxisTick[] {
  return ticks.filter((tick, i) => i % step === 0 || keep(tick))
}

/**
 * How much larger the page's text is than the 16 px the layout measures at. Axis text is set in rem, so
 * the drawn labels grow with the reader's text size, and the collision maths has to grow with them.
 */
export function rootScale(): number {
  return rootFontPx() / DEFAULT_ROOT_PX
}

/**
 * The width of a tick label in pixels, estimated from its length and the font size, scaled by the root
 * text size the caller read once with rootScale().
 */
export function labelWidth(
  label: string,
  fontPx: number,
  scale: number,
  root: RootText = readRoot(),
): number {
  return textEm(label, root) * fontPx * scale
}

function collides(
  ticks: AxisTick[],
  axis: 'x' | 'y',
  fontPx: number,
  scale: number,
  root: RootText,
): boolean {
  return ticks.some((tick, i) => {
    const next = ticks[i + 1]
    if (next === undefined) return false
    const gap = Math.abs(next.position - tick.position)
    const needed =
      axis === 'x'
        ? (labelWidth(tick.label, fontPx, scale, root) +
            labelWidth(next.label, fontPx, scale, root)) /
            2 +
          LABEL_GAP
        : fontPx * scale + 4
    return gap < needed
  })
}
