import { describe, expect, it } from 'vitest'
import { linearRegression, mulberry32, normal } from '../math'
import type { HrPoint, LinearFit } from '../types'
import { clusterSlopeSe } from './clusterSe'
import { fitHr } from './fit'

// x = [0, 2, 1, 3, 2, 4], y = [1, 3, 0, 3, 2, 6]. With the line y = x, residuals are
// e = [1, 1, -1, 0, 0, 2]. Mean x = 2, so xc = [-2, 0, -1, 1, 0, 2] and Sxx = 10.
const X = [0, 2, 1, 3, 2, 4]
const Y = [1, 3, 0, 3, 2, 6]
const LINE: LinearFit = { slope: 1, intercept: 0, slopeSe: 0.1, r2: 0, n: 6 }

function pointsWith(activityIds: string[]): HrPoint[] {
  return X.map((x, i) => ({ metabolicPower: x, heartRate: Y[i]!, activityId: activityIds[i]! }))
}

describe('clusterSlopeSe', () => {
  it('matches a hand computation with three activities of two blocks each', () => {
    // Scores per activity: xc.e sums are A: -2*1 + 0*1 = -2, B: -1*-1 + 1*0 = 1, C: 0*0 + 2*2 = 4.
    // Sum of squares = 21. Variance = (3/2) * (5/4) * 21 / 10^2 = 63/160.
    const se = clusterSlopeSe(pointsWith(['A', 'A', 'B', 'B', 'C', 'C']), LINE)
    expect(se).toBeCloseTo(Math.sqrt(63 / 160), 12)
  })

  it('uses the OLS error when it is larger than the cluster error', () => {
    const big: LinearFit = { ...LINE, slopeSe: 0.9 }
    expect(clusterSlopeSe(pointsWith(['A', 'A', 'B', 'B', 'C', 'C']), big)).toBe(0.9)
  })

  it('inflates by sqrt(n / G) with two activities', () => {
    // G = 2 < 3, so the error is 0.1 * sqrt(6 / 2) = 0.1 * sqrt(3).
    const se = clusterSlopeSe(pointsWith(['A', 'A', 'A', 'B', 'B', 'B']), LINE)
    expect(se).toBeCloseTo(0.1 * Math.sqrt(3), 12)
  })

  it('inflates by sqrt(n / G) with one activity', () => {
    // G = 1: 0.1 * sqrt(6).
    const se = clusterSlopeSe(pointsWith(['A', 'A', 'A', 'A', 'A', 'A']), LINE)
    expect(se).toBeCloseTo(0.1 * Math.sqrt(6), 12)
  })

  it('is clearly larger than OLS when residuals are shared within each activity', () => {
    // Four activities with block powers x = xbar + w, w in {-1.5, -0.5, 0.5, 1.5}, xbar in
    // {2, 3, 4, 5}. y = 2 + 3x + e_g with e = [1, -1, -1, 1] shared within each activity. The
    // offsets are uncorrelated with x, so the fit is exactly y = 2 + 3x and residuals equal e_g.
    // OLS: Sxx = 40, SSE = 16, sigma^2 = 16/14, SE = sqrt(1/35) = 0.1690.
    // Cluster: S_g = 4 * e_g * dev_g = [-6, 2, -2, 6], sum of squares 80.
    // Variance = (4/3) * (15/14) * 80 / 40^2 = 1/14, so SE = 1/sqrt(14) = 0.2673.
    const ids = ['A', 'B', 'C', 'D']
    const e = [1, -1, -1, 1]
    const dev = [-1.5, -0.5, 0.5, 1.5]
    const points: HrPoint[] = []
    for (let g = 0; g < 4; g++) {
      for (const w of [-1.5, -0.5, 0.5, 1.5]) {
        const x = 3.5 + dev[g]! + w
        points.push({ metabolicPower: x, heartRate: 2 + 3 * x + e[g]!, activityId: ids[g]! })
      }
    }
    const fit = fitHr(points)!
    expect(fit.slope).toBeCloseTo(3, 10)
    expect(fit.slopeSe).toBeCloseTo(1 / Math.sqrt(14), 10)
    const olsSe = Math.sqrt(1 / 35)
    expect(fit.slopeSe / olsSe).toBeGreaterThan(1.5)
  })

  it('stays near the OLS error when residuals are independent across many activities', () => {
    const rand = mulberry32(11)
    const xs: number[] = []
    const ys: number[] = []
    const points: HrPoint[] = []
    for (let g = 0; g < 40; g++) {
      for (let k = 0; k < 8; k++) {
        const x = 2 + 4 * rand()
        const y = 2 + 3 * x + normal(rand)
        xs.push(x)
        ys.push(y)
        points.push({ metabolicPower: x, heartRate: y, activityId: `act${g}` })
      }
    }
    const ols = linearRegression(xs, ys)!
    const ratio = clusterSlopeSe(points, ols) / ols.slopeSe
    expect(Math.abs(ratio - 1)).toBeLessThan(0.3)
  })
})
