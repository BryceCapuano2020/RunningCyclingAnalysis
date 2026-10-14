import { describe, expect, it } from 'vitest'
import type { HrPoint } from '../types'
import { fitHr } from './fit'

function pts(xs: number[], ys: number[]): HrPoint[] {
  return xs.map((x, i) => ({ metabolicPower: x, heartRate: ys[i]!, activityId: 'a' }))
}

const RANGE = [0, 1, 2, 3, 4, 5, 6, 7]

describe('fitHr', () => {
  it('returns null with fewer than 8 points', () => {
    const xs = RANGE.slice(0, 7)
    expect(fitHr(pts(xs, xs))).toBeNull()
  })

  it('returns null when the 5th to 95th percentile power spread is under 2 W/kg', () => {
    const xs = RANGE.map((i) => 3 + 0.1 * i)
    expect(fitHr(pts(xs, xs))).toBeNull()
  })

  it('returns null when the slope is zero or negative', () => {
    expect(
      fitHr(
        pts(
          RANGE,
          RANGE.map(() => 120),
        ),
      ),
    ).toBeNull()
    expect(
      fitHr(
        pts(
          RANGE,
          RANGE.map((i) => 10 - i),
        ),
      ),
    ).toBeNull()
  })

  it('fits a perfect line exactly', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8]
    const fit = fitHr(
      pts(
        xs,
        xs.map((x) => 2 + 3 * x),
      ),
    )
    expect(fit).not.toBeNull()
    expect(fit!.slope).toBeCloseTo(3, 12)
    expect(fit!.intercept).toBeCloseTo(2, 12)
    expect(fit!.slopeSe).toBeCloseTo(0, 9)
    expect(fit!.r2).toBeCloseTo(1, 12)
    expect(fit!.n).toBe(8)
  })

  it('matches hand-computed statistics for a noisy line', () => {
    // x = 0..7, y = x +/- 1 alternating. Sxx = 42, Sxy = 38, Syy = 42.
    // slope = 19/21, intercept = 1/3, SSE = 160/21, r2 = 722/882, OLS slopeSe = sqrt(160/5292).
    // Each block is its own activity, so the cluster SE is about 0.160, below OLS, and OLS is kept.
    const ys = [1, 0, 3, 2, 5, 4, 7, 6]
    const separate = RANGE.map((x, i) => ({
      metabolicPower: x,
      heartRate: ys[i]!,
      activityId: `b${i}`,
    }))
    const fit = fitHr(separate)
    expect(fit).not.toBeNull()
    expect(fit!.slope).toBeCloseTo(19 / 21, 12)
    expect(fit!.intercept).toBeCloseTo(1 / 3, 12)
    expect(fit!.r2).toBeCloseTo(722 / 882, 12)
    expect(fit!.slopeSe).toBeCloseTo(Math.sqrt(160 / 5292), 12)
    expect(fit!.n).toBe(8)
  })

  it('inflates the slope SE when all blocks come from one activity', () => {
    // Same data as above in one activity: G = 1 gives cluster SE = OLS * sqrt(8).
    const ys = [1, 0, 3, 2, 5, 4, 7, 6]
    const fit = fitHr(pts(RANGE, ys))
    expect(fit!.slope).toBeCloseTo(19 / 21, 12)
    expect(fit!.slopeSe).toBeCloseTo(Math.sqrt(8 * (160 / 5292)), 12)
  })
})
