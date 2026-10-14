import type { HrPoint, LinearFit } from '../types'

const MIN_CLUSTERS = 3

/**
 * Slope standard error that allows residuals to be correlated within an activity, since blocks
 * from one activity share that day's heart-rate offset. Clusters are activities. With fewer than
 * three clusters the cluster variance cannot be estimated, so the OLS error is inflated by
 * sqrt(n / G), which assumes blocks within an activity are fully correlated. The result is never
 * smaller than the OLS error.
 */
export function clusterSlopeSe(points: HrPoint[], fit: LinearFit): number {
  const n = points.length
  let meanX = 0
  for (const p of points) meanX += p.metabolicPower
  meanX /= n

  let sxx = 0
  const scoreByActivity = new Map<string, number>()
  for (const p of points) {
    const xc = p.metabolicPower - meanX
    const residual = p.heartRate - (fit.intercept + fit.slope * p.metabolicPower)
    sxx += xc * xc
    scoreByActivity.set(p.activityId, (scoreByActivity.get(p.activityId) ?? 0) + xc * residual)
  }

  const g = scoreByActivity.size
  let clusterSe: number
  if (g >= MIN_CLUSTERS) {
    let scoreSquares = 0
    for (const score of scoreByActivity.values()) scoreSquares += score * score
    const variance = (g / (g - 1)) * ((n - 1) / (n - 2)) * (scoreSquares / (sxx * sxx))
    clusterSe = Math.sqrt(variance)
  } else {
    clusterSe = fit.slopeSe * Math.sqrt(n / g)
  }
  return Math.max(fit.slopeSe, clusterSe)
}
