import { describe, expect, it, vi } from 'vitest'
import { NUISANCES } from './test/episodeSim'
import { quantile, replaySim, simulate } from './test/runSim'
import type { SimSpec } from './test/runSim'

vi.setConfig({ testTimeout: 600_000 })

/**
 * Rises on simulated run values (the unit's output, before any digest): how often a rise is said on a library where
 * nothing changes, the lag to a planted gain, and that a dip that comes back is never taken for a rise. Spreads are
 * those of the monitor's own acceptance test. A rise is followed as a slip of the negated series, so the false rate of
 * its first sign (`improving`, a status line) is about the slip's, and the settled `improved` (the only one a finding
 * is made of) has a budget of its own.
 */
const RATES = [1.2, 2, 3, 5]
const YEARS = 3

/** Weeks a state was first shown, in the weeks the display hold has shown it. */
function shownFrom(records: ReturnType<typeof replaySim>, state: string): number[] {
  return records.flatMap((r, i) =>
    r.shown === state && records[i - 1]?.shown !== state ? [r.w] : [],
  )
}

/** First-shown `improving` and `improved` an athlete-year in libraries where nothing changes, over the rates. */
function falseRises(spec: Partial<SimSpec>, libraries = 40) {
  let improving = 0
  let improved = 0
  for (const perWeek of RATES) {
    for (let seed = 1; seed <= libraries; seed++) {
      const weeks = YEARS * 52
      const records = replaySim(simulate({ ...spec, weeks, perWeek }, seed + 3000), weeks)
      improving += shownFrom(records, 'improving').length
      improved += shownFrom(records, 'improved').length
    }
  }
  const years = RATES.length * libraries * YEARS
  return { improving: improving / years, improved: improved / years }
}

describe('rises said when nothing changes, an athlete-year', () => {
  it('says improved under 0.03 (observed 0.010), and improving under 0.2 (observed 0.09), for an athlete with a slow wander and the odd bad run', () => {
    const rates = falseRises({})
    expect(rates.improved).toBeLessThan(0.03)
    expect(rates.improving).toBeLessThan(0.2)
  })

  // Observed improved: heat 0.019, wander 0.058, season 0.010, bad runs 0.013, hills 0.019, strap 0.071.
  // The confounders a rise has: a heat spell ending (the level climbs back from a depressed baseline), a faster wander,
  // a season, bad runs, hills, and a watch or strap that steps up (indistinguishable from a real gain: documented).
  it.each([
    ['heat weeks of 3%', { level: { heatDrop: 0.03 } }, 0.04],
    [
      'a faster, slower wander (3%, correlation 0.95)',
      { level: { wanderSd: 0.03, wanderRho: 0.95 } },
      0.06,
    ],
    ['a season of 1.5% swing', { level: { seasonAmp: 0.015 } }, 0.04],
    ['10% of runs read wrong by the sensor', { bad: 0.1 }, 0.04],
    ['hilly runs, 30% of them 2% slow with wide spread', { hilly: 0.3 }, 0.04],
  ] as const)('stays under budget through %s', (_name, spec, budget) => {
    expect(falseRises(spec).improved).toBeLessThan(budget)
  })

  it('stays under budget through every nuisance at once', () => {
    // Observed 0.049.
    expect(falseRises(NUISANCES['every nuisance at once']).improved).toBeLessThan(0.06)
  })

  it('reads a watch or strap that steps up by 3% as a real gain, as documented', () => {
    const rates = falseRises({ level: { strapStep: 0.03 } }, 20)
    expect(rates.improved).toBeLessThan(0.12)
  })
})

describe('a planted gain', () => {
  const step = (size: number, perWeek: number): SimSpec => ({
    weeks: 160,
    perWeek,
    planted: [{ type: 'step', week: 60, size }],
  })

  /** Weeks from the gain to the first `improving` and to the first `improved`, over seeds. */
  function lags(spec: SimSpec, seeds: number) {
    const first: number[] = []
    const settled: number[] = []
    for (let seed = 1; seed <= seeds; seed++) {
      const records = replaySim(simulate(spec, seed), spec.weeks)
      const a = records.find(
        (r) => r.w >= 58 && (r.shown === 'improving' || r.shown === 'improved'),
      )
      const b = records.find((r) => r.w >= 58 && r.shown === 'improved')
      first.push(a === undefined ? Number.POSITIVE_INFINITY : a.w - 60 + 1)
      settled.push(b === undefined ? Number.POSITIVE_INFINITY : b.w - 60 + 1)
    }
    return { first, settled }
  }
  const within = (xs: number[], weeks: number) => xs.filter((x) => x <= weeks).length / xs.length

  it('sees a gain of 8% as improving within weeks, and as improved in about half a year', () => {
    const { first, settled } = lags(step(0.08, 3), 40)
    // Observed: median 4 weeks, 82% within 12 and 85% within 26 (a slip of the same size: 97% within 12); improved,
    // median 23 weeks, 73% within 36 and 80% within 52.
    expect(quantile(first, 0.5)).toBeLessThanOrEqual(6)
    expect(within(first, 12)).toBeGreaterThanOrEqual(0.75)
    expect(within(first, 26)).toBeGreaterThanOrEqual(0.8)
    expect(within(settled, 52)).toBeGreaterThanOrEqual(0.7)
  })

  it('sees a gain of 8% at one run a week more slowly, still as improved within a year', () => {
    const { first, settled } = lags(step(0.08, 1.2), 40)
    // Observed: median 7 weeks, 90% within 26; improved 70% within 52.
    expect(within(first, 26)).toBeGreaterThanOrEqual(0.8)
    expect(within(settled, 52)).toBeGreaterThanOrEqual(0.6)
  })
})

describe('a dip that comes back', () => {
  it('is back, never improving or improved, while the dip is in the weeks compared with', () => {
    let reachedBack = 0
    let rose = 0
    for (let seed = 1; seed <= 40; seed++) {
      const spec: SimSpec = {
        weeks: 200,
        perWeek: 3,
        planted: [
          { type: 'step', week: 60, size: -0.08 },
          { type: 'step', week: 100, size: 0.08 },
        ],
      }
      const records = replaySim(simulate(spec, seed), spec.weeks)
      const back = shownFrom(records, 'back')[0]
      if (back === undefined) continue
      reachedBack++
      if (records.some((r) => r.w >= 90 && (r.shown === 'improving' || r.shown === 'improved')))
        rose++
    }
    expect(reachedBack).toBeGreaterThanOrEqual(30)
    expect(rose).toBeLessThanOrEqual(3)
  })
})
