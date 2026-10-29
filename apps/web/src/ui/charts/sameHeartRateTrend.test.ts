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

  it('recovers a straight line through the weeks, and its slope', () => {
    const fit = trendOf(line(8))!
    expect(fit.at(0)).toBeCloseTo(100, 6)
    expect(fit.at(7)).toBeCloseTo(114, 6)
    expect(fit.slope).toBeCloseTo(2, 6)
  })

  it('runs only from the first reporting week to the last, never past them', () => {
    const fit = trendOf(line(8).map((p) => point(p.t + 3, p.y, 2)))!
    expect([fit.from, fit.to]).toEqual([3, 10])
  })

  it('is clear of flat when the slope’s own band excludes zero, and not when it does not', () => {
    expect(trendOf(line(8))!.clear).toBe(true)
    // The same weeks scattered about a flat line: the slope is within its band.
    const flat = [100, 108, 96, 107, 97, 109, 98, 105].map((y, t) => point(t, y, 2))
    expect(trendOf(flat)!.clear).toBe(false)
  })

  it('reads a fall as clearly as a rise', () => {
    const fit = trendOf(line(8).map((p) => point(p.t, 114 - 2 * p.t, 2)))!
    expect(fit.clear).toBe(true)
    expect(fit.slope).toBeCloseTo(-2, 6)
  })

  it('does not call a slope clear from three weeks whose intervals leave room for flat', () => {
    expect(trendOf(line(3, 4))!.clear).toBe(false)
  })

  it('weights a tightly pinned week above a loose one, but not without limit', () => {
    // The week at 1 is off the line by 20. With a wide interval the line hardly moves for it; with a tight one it does.
    const off = (margin: number) => line(5).map((p) => (p.t === 1 ? point(1, p.y + 20, margin) : p))
    const loose = trendOf(off(80))!
    const tight = trendOf(off(2))!
    const shift = (fit: NonNullable<ReturnType<typeof trendOf>>) => Math.abs(fit.at(1) - 102)
    expect(shift(loose)).toBeLessThan(shift(tight) / 2)
    expect(shift(loose)).toBeLessThan(6)
  })

  it('does not let one very tight week be the line: its weight is capped at four times the median', () => {
    // Four weeks on y = 100 + 2t with +/-4, and one at t = 4 that is 10 off but pinned to +/-0.01.
    const weeks = [0, 1, 2, 3].map((t) => point(t, 100 + 2 * t, 4))
    const fit = trendOf([...weeks, point(4, 118, 0.01)])!
    // Uncapped, the line would pass within 0.1 of that week; capped, it stays well off it.
    expect(Math.abs(fit.at(4) - 118)).toBeGreaterThan(1)
  })

  it('draws a band that is narrowest in the middle of the weeks and widens towards the ends', () => {
    const fit = trendOf(line(9))!
    expect(fit.half(4)).toBeLessThan(fit.half(0))
    expect(fit.half(4)).toBeLessThan(fit.half(8))
    expect(fit.half(0)).toBeCloseTo(fit.half(8), 6)
  })

  it('widens the band for the overlap of the weekly windows: twice what independent weeks would give', () => {
    // Independent weeks, each +/-2 at 90% (se = 2/1.645), n = 9: the mean's half-width is 1.645 * se / 3 = 0.667.
    // Four weeks' windows overlap in three, so the band is wider by the root of 4: 1.333.
    expect(trendOf(line(9))!.half(4)).toBeCloseTo(0.667 * 2, 2)
  })

  it('widens it further when the weeks scatter about the line more than their intervals allow', () => {
    const tidy = trendOf(line(8, 2))!
    const scattered = trendOf(
      [0, 3, -3, 4, -4, 3, -3, 0].map((e, t) => point(t, 100 + 2 * t + e, 2)),
    )!
    expect(scattered.half(3.5)).toBeGreaterThan(tidy.half(3.5) * 2)
  })

  it('never narrows the band for weeks that fit the line better than their intervals say', () => {
    // Exactly on the line: chi-square is zero, so the band is the intervals' own, widened only for the overlap.
    // se = 6 / 1.645 for each of 8 weeks: half-width at the middle is 1.645 * 2 / sqrt(8 / se^2).
    const se = 6 / 1.645
    expect(trendOf(line(8, 6))!.half(3.5)).toBeCloseTo((1.645 * 2) / Math.sqrt(8 / se ** 2), 6)
  })

  it('draws a wider band for weeks with wider intervals', () => {
    expect(trendOf(line(8, 6))!.half(3)).toBeGreaterThan(trendOf(line(8, 2))!.half(3))
  })
})
