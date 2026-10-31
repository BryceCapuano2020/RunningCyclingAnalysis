import { describe, expect, it } from 'vitest'
import { mulberry32, normal } from '../math'
import { FITNESS } from './params'
import { fitSeason, seasonOf, withoutSeason } from './season'
import type { RunPoint } from './windows'

const S = FITNESS.season
const YEAR = 365.25

/** Three runs a week from day 1 for `weeks` weeks: `shape(t)` plus a seeded 3.8% spread and a 2% slow wander. */
function runs(weeks: number, shape: (t: number) => number, seed = 5): RunPoint[] {
  const random = mulberry32(seed)
  const points: RunPoint[] = []
  let wander = 0
  for (let w = 0; w < weeks; w++) {
    wander = 0.9 * wander + Math.sqrt(1 - 0.81) * 0.02 * normal(random)
    for (let i = 0; i < 3; i++) {
      const t = w * 7 + 1 + i * 2
      points.push({ id: `s${w}-${i}`, t, x: shape(t) + wander + 0.038 * normal(random) })
    }
  }
  return points
}

const sine =
  (amplitude: number, phase = 0.7) =>
  (t: number) =>
    amplitude * Math.sin((2 * Math.PI * t) / YEAR + phase)
const dayOf = (weeks: number) => weeks * 7

describe('the athlete’s own season', () => {
  it('finds a planted swing of 3% over three years, with its phase', () => {
    const series = runs(156, sine(0.03))
    const season = fitSeason(series, dayOf(156))!
    expect(season).not.toBeNull()
    expect(season.amplitude).toBeGreaterThan(0.022)
    expect(season.amplitude).toBeLessThan(0.034)
    // At the planted peak and trough the fitted term is within 1% of the planted one.
    for (const t of [0.2, 0.45, 0.7, 0.95].map((f) => 600 + f * YEAR)) {
      expect(Math.abs(seasonOf(season, t) - sine(0.03)(t))).toBeLessThan(0.01)
    }
  })

  it('has nothing before two whole years of runs', () => {
    expect(fitSeason(runs(100, sine(0.04)), dayOf(100))).toBeNull()
    expect(fitSeason(runs(156, sine(0.04)), dayOf(100))).toBeNull()
  })

  it('has nothing for a library whose level only wanders', () => {
    let found = 0
    for (let seed = 1; seed <= 30; seed++) {
      const season = fitSeason(
        runs(156, () => 0, seed),
        dayOf(156),
      )
      if (season !== null) {
        found++
        expect(season.amplitude).toBeLessThan(0.03)
      }
    }
    // Most (about 70%) are shrunk to nothing; the rest are small (90% under 1.2%).
    expect(found).toBeLessThan(15)
  })

  it('reads days before the origin, which the quarters count modulo a year', () => {
    const early = runs(156, sine(0.03)).map((r) => Object.assign({}, r, { t: r.t - 2000 }))
    expect(fitSeason(early, dayOf(156) - 2000)).not.toBeNull()
  })

  it('has nothing without runs in every quarter of the year', () => {
    const gapped = runs(160, sine(0.04)).filter((r) => {
      const quarter = Math.floor(((r.t % YEAR) / YEAR) * 4)
      return quarter !== 1
    })
    expect(gapped.length).toBeGreaterThan(S.minRuns)
    expect(fitSeason(gapped, dayOf(160))).toBeNull()
  })

  it('does not take a clean step part-way through for a season: what it leaves swamps the swing', () => {
    // An 8% step at the middle of three years with no wander. A swing of up to 2 * size / (pi * years) (1.7%) would fit it, but the residuals it leaves are far larger than that.
    const random = mulberry32(3)
    const stepped: RunPoint[] = []
    for (let w = 0; w < 156; w++) {
      for (let i = 0; i < 3; i++) {
        const t = w * 7 + 1 + i * 2
        stepped.push({ id: `p${w}-${i}`, t, x: (t > 546 ? -0.08 : 0) + 0.01 * normal(random) })
      }
    }
    expect(fitSeason(stepped, dayOf(156))).toBeNull()
  })

  it('with a wander and a step part-way through, finds a term in a third of libraries, mostly small', () => {
    // Observed over 200 libraries: a term in 36%, 2% at the 90th percentile and 4% at most (the leak alone is 1.7%): the wander adds to it.
    const amplitudes: number[] = []
    for (let seed = 1; seed <= 100; seed++) {
      const series = runs(156, (t) => (t > 546 ? -0.08 : 0), seed)
      amplitudes.push(fitSeason(series, dayOf(156))?.amplitude ?? 0)
    }
    amplitudes.sort((a, b) => a - b)
    const found = amplitudes.filter((a) => a > 0).length
    expect(found).toBeGreaterThan(10)
    expect(found).toBeLessThan(60)
    expect(amplitudes[90]!).toBeLessThan(0.03)
    expect(amplitudes[99]!).toBeLessThan(0.05)
  })

  it('takes the term out of every run from a day on, and leaves the runs alone without one', () => {
    const series = runs(156, sine(0.03))
    const season = fitSeason(series, dayOf(156))!
    const adjusted = withoutSeason(series, season, dayOf(100), dayOf(156))
    expect(adjusted.length).toBeLessThan(series.length)
    expect(adjusted[0]!.x).toBeCloseTo(
      series.find((r) => r.id === adjusted[0]!.id)!.x - seasonOf(season, adjusted[0]!.t),
      12,
    )
    expect(withoutSeason(series, null, 0, dayOf(156))).toBe(series)
  })
})
