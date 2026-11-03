import { BIWEIGHT_C, BIWEIGHT_ITERATIONS, MAD_TO_SD, MIN_SCALE_SHARE } from './constants'
import { weightedMedian, type Weighted } from './stats'

export interface RobustMean {
  value: number
  /**
   * The relative error of the mean, 1 / sqrt(sum of weights). It reads as one only where each weight is the inverse
   * square of that point's relative error, as the callers make them.
   */
  relativeError: number
  /** The final weight of each input, in the order given: 0 for a value the mean threw out. */
  weights: number[]
  /** How many inputs had a positive weight to begin with. */
  of: number
}

/**
 * A weighted mean that gives no say to a value far from the rest: a Tukey biweight, started at the weighted median, with
 * the scale from the weighted median absolute deviation (never under 2% of the centre) and six passes. One wild value
 * falls outside the cut-off and counts for nothing; a cluster of values near each other keeps its weight.
 * Inputs that are not positive and finite are left out.
 */
export function robustMean(points: readonly Weighted[]): RobustMean | null {
  const live = points
    .map((p, index) => ({ ...p, index }))
    .filter((p) => p.weight > 0 && Number.isFinite(p.value) && p.value > 0)
  if (live.length === 0) return null
  let centre = weightedMedian(live)
  const deviation = weightedMedian(
    live.map((p) => ({ value: Math.abs(p.value - centre), weight: p.weight })),
  )
  const scale = Math.max(MAD_TO_SD * deviation, MIN_SCALE_SHARE * centre)
  let kept = live.map((p) => p.weight)
  for (let pass = 0; pass < BIWEIGHT_ITERATIONS; pass++) {
    const next = live.map((p) => {
      const u = (p.value - centre) / (BIWEIGHT_C * scale)
      return Math.abs(u) >= 1 ? 0 : p.weight * (1 - u * u) ** 2
    })
    const total = next.reduce((sum, w) => sum + w, 0)
    if (!(total > 0)) break
    kept = next
    centre = live.reduce((sum, p, i) => sum + p.value * next[i]!, 0) / total
  }
  const weights = points.map(() => 0)
  live.forEach((p, i) => (weights[p.index] = kept[i]!))
  const total = kept.reduce((sum, w) => sum + w, 0)
  return { value: centre, relativeError: 1 / Math.sqrt(total), weights, of: live.length }
}
