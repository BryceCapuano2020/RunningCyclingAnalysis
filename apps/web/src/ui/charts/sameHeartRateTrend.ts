import { SAME_HEART_RATE } from '@rca/core/constants'
import type { SameHeartRateWeek } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { plottedValue } from './sportAxis'

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
  /** The line's slope per unit of t, and half the 90% band of that slope, in the plotted unit. */
  slope: number
  slopeHalf: number
  /** Whether the slope's band excludes zero: the trend is clear of no change. */
  clear: boolean
  /** The first and last time a week reports at: the line is drawn between them and never past. */
  from: number
  to: number
}

/** A 90% interval is this many standard errors either side of the middle. */
const Z90 = 1.645
/** The line needs this many reporting weeks: with two it would join them and claim a trend. */
const MIN_POINTS = 3
/** Weekly points share 3 of every 4 weeks of data, so they carry this many times less news than independent ones. */
const OVERLAP = SAME_HEART_RATE.windowDays / 7
/** No week is weighted more than this many times the median weight, or less than the median over it, so one tight week cannot be the line. */
const WEIGHT_RATIO = 4

/** The middle of a list of numbers. */
function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * A straight line through the weekly outputs, each weighted by how tightly its own interval pinned it down (within
 * WEIGHT_RATIO of the median weight), with the band the line's own uncertainty makes. Two things widen the band
 * beyond what the weeks' own intervals say: the windows overlap, by OVERLAP; and the weeks may scatter about the line
 * more than their intervals allow, by the root of the weighted chi-square per degree of freedom, never below 1. The
 * slope's band is the same widening, and the trend is clear when it excludes zero. Null with too few weeks, or weeks
 * all at one time. The sentence over the chart names a change only when this is clear, so a line the band cannot
 * tell from flat is never claimed.
 */
export function trendOf(points: readonly TrendInput[]): TrendFit | null {
  if (points.length < MIN_POINTS) return null
  const raw = points.map((p) => {
    const se = Math.max(Math.abs(p.high - p.low) / (2 * Z90), Math.abs(p.y) * 1e-4, 1e-9)
    return 1 / (se * se)
  })
  const middle = medianOf(raw)
  const weighted = points.map((p, i) => ({
    t: p.t,
    y: p.y,
    w: Math.min(Math.max(raw[i]!, middle / WEIGHT_RATIO), middle * WEIGHT_RATIO),
  }))
  const total = weighted.reduce((sum, p) => sum + p.w, 0)
  const meanT = weighted.reduce((sum, p) => sum + p.w * p.t, 0) / total
  const meanY = weighted.reduce((sum, p) => sum + p.w * p.y, 0) / total
  const spread = weighted.reduce((sum, p) => sum + p.w * (p.t - meanT) ** 2, 0)
  if (!(spread > 0)) return null
  const slope = weighted.reduce((sum, p) => sum + p.w * (p.t - meanT) * (p.y - meanY), 0) / spread
  const chiSquare = weighted.reduce(
    (sum, p) => sum + p.w * (p.y - (meanY + slope * (p.t - meanT))) ** 2,
    0,
  )
  const scatter = Math.max(1, Math.sqrt(chiSquare / (weighted.length - 2)))
  const widen = scatter * Math.sqrt(OVERLAP)
  const slopeHalf = Z90 * widen * Math.sqrt(1 / spread)
  const times = weighted.map((p) => p.t)
  return {
    at: (t) => meanY + slope * (t - meanT),
    half: (t) => Z90 * widen * Math.sqrt(1 / total + (t - meanT) ** 2 / spread),
    slope,
    slopeHalf,
    clear: Math.abs(slope) > slopeHalf,
    from: Math.min(...times),
    to: Math.max(...times),
  }
}

const WEEK_MS = 7 * 86_400_000

/** The weeks that report, as the trend's input: time in weeks from `startMs`, and the plotted values. */
export function trendInputs(
  weeks: readonly SameHeartRateWeek[],
  sport: Sport,
  units: UnitSystem,
  startMs: number,
): TrendInput[] {
  return weeks.flatMap((week) => {
    if (week.fit === null) return []
    const [low, high] = [week.fit.low, week.fit.high].map((v) => plottedValue(sport, v, units))
    return [
      {
        t: (week.endMs - startMs) / WEEK_MS,
        y: plottedValue(sport, week.fit.output, units),
        low: low!,
        high: high!,
      },
    ]
  })
}

/** The fitted trend of a sport's reporting weeks, or null with too few; its time is in weeks from the first week listed. */
export function weeksTrend(
  weeks: readonly SameHeartRateWeek[],
  sport: Sport,
  units: UnitSystem,
): TrendFit | null {
  const first = weeks[0]
  return first === undefined ? null : trendOf(trendInputs(weeks, sport, units, first.endMs))
}
