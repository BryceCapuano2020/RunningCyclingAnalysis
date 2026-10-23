import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { Comparison, ComparisonPoint } from '@rca/core/types'

export interface HeadlinePick {
  point: ComparisonPoint
  /** True when the point comes from the heart-rate calibrated comparison. */
  calibrated: boolean
}

/**
 * The comparison point the headline describes: 20 minutes when present, otherwise the duration
 * closest to it on a log scale. The heart-rate calibrated comparison is used when available.
 */
export function pickHeadline(comparison: Comparison): HeadlinePick | null {
  const calibrated = comparison.calibrated !== null
  const points = comparison.calibrated ?? comparison.prior
  let best: ComparisonPoint | null = null
  let bestDistance = Infinity
  for (const point of points) {
    const distance = Math.abs(Math.log(point.durationS) - Math.log(HEADLINE_DURATION_S))
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best === null ? null : { point: best, calibrated }
}
