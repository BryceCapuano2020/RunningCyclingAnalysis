import type { Comparison, ComparisonPoint } from '../../core/types'

const TARGET_S = 1200

export interface HeadlinePick {
  point: ComparisonPoint
  /** True when the point comes from the heart-rate calibrated comparison. */
  calibrated: boolean
}

/**
 * The comparison point the headline describes: 1200 s when present, otherwise the duration
 * closest to 1200 s on a log scale. The heart-rate calibrated comparison is used when available.
 */
export function pickHeadline(comparison: Comparison): HeadlinePick | null {
  const calibrated = comparison.calibrated !== null
  const points = comparison.calibrated ?? comparison.prior
  let best: ComparisonPoint | null = null
  let bestDistance = Infinity
  for (const point of points) {
    const distance = Math.abs(Math.log(point.durationS) - Math.log(TARGET_S))
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best === null ? null : { point: best, calibrated }
}
