import { SAME_HEART_RATE } from '@rca/core/constants'

/** One reporting week: when it ends, its output as plotted (seconds per unit, or watts), and its 90% interval's ends. */
export interface TrendInput {
  t: number
  y: number
  low: number
  high: number
}

/** A fitted line with the half-width of its 90% band at any time. */
export interface TrendFit {
  /** The line's value at t. */
  at: (t: number) => number
  /** Half the band's height at t, in the plotted unit. */
  half: (t: number) => number
}

/** A 90% interval is this many standard errors either side of the middle. */
const Z90 = 1.645
/** The line needs this many reporting weeks: with two it would join them and claim a trend. */
const MIN_POINTS = 3
/** Weekly points share 3 of every 4 weeks of data, so they carry this many times less news than independent ones. */
const OVERLAP = SAME_HEART_RATE.windowDays / 7

/**
 * A straight line through the weekly outputs, each weighted by how tightly its own interval pinned it down, with the
 * band the line's own uncertainty makes. The weeks' windows overlap, so the band is widened by the overlap. Null with too few weeks, or weeks all at one time. This is
 * how the line is drawn; the sentence over the chart still names a change only by the first and last weeks'
 * intervals, so a slope the band cannot rule out is never stated.
 */
export function trendOf(points: readonly TrendInput[]): TrendFit | null {
  if (points.length < MIN_POINTS) return null
  const weighted = points.map((p) => {
    const se = Math.max(Math.abs(p.high - p.low) / (2 * Z90), Math.abs(p.y) * 1e-4, 1e-9)
    return { ...p, w: 1 / (se * se) }
  })
  const total = weighted.reduce((sum, p) => sum + p.w, 0)
  const meanT = weighted.reduce((sum, p) => sum + p.w * p.t, 0) / total
  const meanY = weighted.reduce((sum, p) => sum + p.w * p.y, 0) / total
  const spread = weighted.reduce((sum, p) => sum + p.w * (p.t - meanT) ** 2, 0)
  if (!(spread > 0)) return null
  const slope = weighted.reduce((sum, p) => sum + p.w * (p.t - meanT) * (p.y - meanY), 0) / spread
  return {
    at: (t) => meanY + slope * (t - meanT),
    half: (t) => Z90 * Math.sqrt(OVERLAP * (1 / total + (t - meanT) ** 2 / spread)),
  }
}
