import { linearRegression, quantileSorted } from '../math'
import type { HrPoint, LinearFit } from '../types'
import { clusterSlopeSe } from './clusterSe'

const MIN_POINTS = 8
const MIN_POWER_SPREAD = 2

/**
 * Regresses heart rate on metabolic power. The slope standard error is cluster-robust by
 * activity. Null when there is too little data, when the power range is too narrow to pin down a
 * slope, or when heart rate does not rise with power.
 */
export function fitHr(points: HrPoint[]): LinearFit | null {
  if (points.length < MIN_POINTS) return null
  const power = points.map((p) => p.metabolicPower)
  const heartRate = points.map((p) => p.heartRate)
  const sorted = Float64Array.from(power).sort()
  const spread = quantileSorted(sorted, 0.95) - quantileSorted(sorted, 0.05)
  if (!(spread >= MIN_POWER_SPREAD)) return null
  const fit = linearRegression(power, heartRate)
  if (fit === null || fit.slope <= 0) return null
  return { ...fit, slopeSe: clusterSlopeSe(points, fit) }
}
