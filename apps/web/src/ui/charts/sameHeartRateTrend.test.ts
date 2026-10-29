import { describe, expect, it } from 'vitest'
import { trendOf } from './sameHeartRateTrend'

/** A week at time t with output y and an interval of +/- `margin`. */
function point(t: number, y: number, margin: number) {
  return { t, y, low: y - margin, high: y + margin }
}

/** Weeks 0..n-1 on a straight line y = 100 + 2t, each with a 90% interval of +/- `margin`. */
function line(n: number, margin = 2) {
  return Array.from({ length: n }, (_, t) => point(t, 100 + 2 * t, margin))
}

describe('trendOf', () => {
  it('has no line with fewer than three weeks, since a line through two is just those two', () => {
    expect(trendOf(line(2))).toBeNull()
    expect(trendOf([])).toBeNull()
  })

  it('has no line when every week is at the same time', () => {
    expect(trendOf(line(4).map((p) => point(3, p.y, p.high - p.y)))).toBeNull()
  })

  it('recovers a straight line through the weeks', () => {
    const fit = trendOf(line(8))!
    expect(fit.at(0)).toBeCloseTo(100, 6)
    expect(fit.at(7)).toBeCloseTo(114, 6)
  })

  it('weights a tightly pinned week above a loose one', () => {
    // The middle week is far off the line but its interval is wide, so the line hardly moves for it.
    const points = line(5).map((p) => (p.t === 2 ? point(2, p.y + 20, 80) : p))
    const fit = trendOf(points)!
    expect(Math.abs(fit.at(2) - 104)).toBeLessThan(5)
  })

  it('draws a band that is narrowest in the middle of the weeks and widens towards the ends', () => {
    const fit = trendOf(line(9))!
    expect(fit.half(4)).toBeLessThan(fit.half(0))
    expect(fit.half(4)).toBeLessThan(fit.half(8))
    expect(fit.half(0)).toBeCloseTo(fit.half(8), 6)
  })

  it('widens the band for the overlap of the weekly windows, so it is wider than independent weeks would give', () => {
    // Independent weeks, each +/-2 at 90% (se = 2/1.645), n = 9: the mean's half-width is 1.645 * se / 3 = 0.667.
    expect(trendOf(line(9))!.half(4)).toBeGreaterThan(0.667 * 1.5)
  })

  it('draws a wider band for weeks with wider intervals', () => {
    expect(trendOf(line(8, 6))!.half(3)).toBeGreaterThan(trendOf(line(8, 2))!.half(3))
  })
})
