import type { QuietGap, TimeAxis } from '@rca/core/digest/trendSeries'
import type { Scale } from './scale'

/** The width a skipped stretch of the time axis is given, in px. */
export const GAP_PX = 28

/** A time scale that gives each skipped gap a fixed width, and the x of the middle of each gap, where its break is marked. */
export interface TimeScale {
  x: Scale
  breaks: { x: number; gap: QuietGap }[]
}

/**
 * A scale from time to x over [startMs, endMs] that skips the gaps: each gap is drawn GAP_PX wide, however
 * long it was, and the rest of the span shares what is left in proportion to its time. A gap that would leave
 * no room is drawn narrower. An instant inside a gap is placed in it in proportion, though no row sits there.
 */
export function timeScale(
  axis: Pick<TimeAxis, 'startMs' | 'endMs'> & { gaps: readonly QuietGap[] },
  range: [left: number, right: number],
): TimeScale {
  const [left, right] = range
  const gaps = [...axis.gaps].sort((a, b) => a.fromMs - b.fromMs)
  const gapMs = gaps.reduce((sum, gap) => sum + (gap.toMs - gap.fromMs), 0)
  const liveMs = axis.endMs - axis.startMs - gapMs
  const gapPx = Math.min(GAP_PX, (right - left) / (gaps.length + 1) / 2)
  const livePx = right - left - gapPx * gaps.length
  const perMs = liveMs > 0 ? livePx / liveMs : 0
  const x: Scale = (ms) => {
    if (liveMs <= 0) return (left + right) / 2
    let at = left
    let from = axis.startMs
    for (const gap of gaps) {
      if (ms <= gap.fromMs) return at + (ms - from) * perMs
      at += (gap.fromMs - from) * perMs
      if (ms < gap.toMs) return at + ((ms - gap.fromMs) / (gap.toMs - gap.fromMs)) * gapPx
      at += gapPx
      from = gap.toMs
    }
    return at + (ms - from) * perMs
  }
  return { x, breaks: gaps.map((gap) => ({ x: (x(gap.fromMs) + x(gap.toMs)) / 2, gap })) }
}
