import type { RouteShape } from '@rca/core/route/routeShape'
import type { ActivityTrace } from '@rca/core/workbench'

/** The pace shares are cut at these quantiles of the segments' speeds, so one stop or sprint does not wash the rest to one colour. */
const SLOW_QUANTILE = 0.1
const FAST_QUANTILE = 0.9

/** The share of the fast speed that the fast and slow ends may differ by before the route reads as one even pace. */
const FLAT_SPREAD = 0.02

/** The value at a quantile of ascending numbers. */
function quantile(sorted: readonly number[], share: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))]!
}

/**
 * How fast the athlete went along each segment of the route outline, from 0 (among the slowest) to 1 (among
 * the fastest), or null when the trace cannot say. The outline carries no time or distance, by design, so
 * the length of the path stands in for the distance: each segment covers the same share of the distance as
 * of the path, and its speed is that distance over the moving time the trace spent there. The outline is
 * simplified, so this is a guide to where the pace was high or low, not a measurement. It reads only the
 * trace already on this device and sends nothing.
 */
export function routeSegmentPace(
  shape: RouteShape | null,
  trace: ActivityTrace | null,
): number[] | null {
  if (shape === null || trace === null || shape.points.length < 3) return null
  const { distance, paused, unrecorded } = trace
  const known: number[] = []
  for (let i = 0; i < distance.length; i += 1) if (Number.isFinite(distance[i]!)) known.push(i)
  const first = distance[known[0] ?? 0]!
  const total = (distance[known.at(-1) ?? 0] ?? first) - first
  if (known.length < 2 || !(total > 0)) return null

  // Moving seconds before each second boundary: a stop is not slow running.
  const moving = new Float64Array(distance.length + 1)
  for (let i = 0; i < distance.length; i += 1) {
    moving[i + 1] = moving[i]! + (paused[i] === 1 || unrecorded[i] === 1 ? 0 : 1)
  }
  /** The moving seconds spent by the time `share` of the distance was covered. */
  const movingAt = (share: number) => {
    const target = first + share * total
    let low = 0
    let high = known.length - 1
    while (low < high) {
      const mid = (low + high) >> 1
      if (distance[known[mid]!]! < target) low = mid + 1
      else high = mid
    }
    const upper = known[low]!
    const lower = known[Math.max(0, low - 1)]!
    const span = distance[upper]! - distance[lower]!
    const along = span > 0 ? (target - distance[lower]!) / span : 0
    return moving[lower]! + along * (moving[upper]! - moving[lower]!)
  }

  const lengths = shape.points.slice(1).map(([x, y], i) => {
    const [px, py] = shape.points[i]!
    return Math.hypot(x - px, y - py)
  })
  const path = lengths.reduce((sum, length) => sum + length, 0)
  if (!(path > 0)) return null
  let covered = 0
  const speeds = lengths.map((length) => {
    const from = covered / path
    covered += length
    const to = covered / path
    const seconds = movingAt(to) - movingAt(from)
    return seconds > 0 ? ((to - from) * total) / seconds : Number.NaN
  })
  const sorted = speeds.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length < 2) return null
  const slow = quantile(sorted, SLOW_QUANTILE)
  const fast = quantile(sorted, FAST_QUANTILE)
  // A spread under 2% of the pace is rounding, not a difference to colour.
  const level = fast - slow <= fast * FLAT_SPREAD
  return speeds.map((speed) => {
    if (!Number.isFinite(speed) || level) return 0.5
    return Math.min(1, Math.max(0, (speed - slow) / (fast - slow)))
  })
}
