import { describe, expect, it, vi } from 'vitest'
import { DAY_MS } from '../constants'
import { MONDAY } from '../digest/test/sameHeartRateFixture'
import { fitnessStatuses } from './compute'
import { meterLibrary, PREFIX_WEEKS, shareClearing } from './test/earlySim'

vi.setConfig({ testTimeout: 900_000 })

/**
 * The calibration case of docs/design/ride-early-trend.md: synthetic riders in their first weeks on a power meter
 * (rideSim: a ride's day 2%, blocks 3.5%, the measured 2% wander unless stated), 24 weeks long, read at each week end from
 * meter week 2 until the monitor has its baseline.
 */
const BASE = { weeks: 24, rideSd: 0.02, blockSd: 0.035 } as const
const PER_WEEK = [1, 2, 3] as const
const WEEK_MS = 7 * DAY_MS

describe('an early trend for riders whose fitness does not change', () => {
  // Observed (300 libraries, 52 virtual weeks before the meter): 10%, 8% and 8% at one, two and three rides a week. Budget 12%.
  it.each(PER_WEEK)(
    'clears zero on two week ends running in at most 12%, at %s a week',
    (perWeek) => {
      expect(shareClearing({ ...BASE, perWeek }, 300)).toBeLessThanOrEqual(0.12)
    },
  )
})

describe('a season over the early period', () => {
  /** The meter arriving 6 and 32 weeks into a season-year (the prototype's phases), and before its rise, at its peak, before its fall and at its low. */
  const LEADS = [6, 32, 35, 3, 9, 29]
  const worst = (perWeek: 1 | 2 | 3, seasonal: number) =>
    LEADS.map((lead) => shareClearing({ ...BASE, perWeek, seasonal, wanderSd: 0.03 }, 200, lead))
  // The spec's prototype read these at the worst phase (acceptance 2: within 5 points). This build reads 28%, 28% and 32% at a 1.5%
  // season and 36%, 36% and 44% at 3%.
  const SPEC = {
    0.015: { 1: 0.31, 2: 0.3, 3: 0.34 },
    0.03: { 1: 0.38, 2: 0.38, 3: 0.48 },
  } as const
  it.each([0.015, 0.03] as const)(
    'holds the spec’s rows within 5 points: a season of %s',
    (seasonal) => {
      for (const perWeek of PER_WEEK) {
        const shares = worst(perWeek, seasonal)
        expect(Math.abs(Math.max(...shares) - SPEC[seasonal][perWeek])).toBeLessThanOrEqual(0.05)
        // Every phase is far over the 12% budget a direction word would need, so the card prints none.
        expect(Math.min(...shares)).toBeGreaterThan(0.12)
      }
    },
  )
})

describe('a planted change over the first 12 weeks on the meter', () => {
  const read = (planted: number, seed: number) => {
    const ramp = (w: number) => planted * Math.min(1, Math.max(0, w / 12))
    const { digests } = meterLibrary({
      ...BASE,
      weeks: 12,
      perWeek: 2,
      seed,
      planted: (w) => ramp(w - PREFIX_WEEKS),
    })
    const s = fitnessStatuses(digests, new Set(), { enabled: { ride: true } }).ride
    if (s.early === undefined) return null
    const week = (ms: number) => (ms - MONDAY) / WEEK_MS - PREFIX_WEEKS
    const middle = (g: { fromMs: number; toMs: number }) => week((g.fromMs + g.toMs) / 2)
    const asked = Math.expm1(ramp(middle(s.early.newest)) - ramp(middle(s.early.first)))
    return { early: s.early, asked }
  }
  const libraries = (planted: number) =>
    Array.from({ length: 100 }, (_, i) => read(planted, i + 1)).filter((r) => r !== null)
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1]!

  // Observed: the median estimate within 0.3 points of the change between the groups' median weeks, for a rise and a slip.
  it.each([0.05, -0.05])('puts the median estimate within 1 point of a planted %s', (planted) => {
    const runs = libraries(planted)
    expect(runs.length).toBeGreaterThanOrEqual(95)
    expect(Math.abs(median(runs.map((r) => r.early.change.value - r.asked)))).toBeLessThan(0.01)
  })

  // Observed over 300 libraries: 76% (the spec's prototype read 72%, its acceptance asks for 65%).
  it('has its range above zero in at least 65% for a 10% rise', () => {
    const runs = libraries(0.1)
    const up = runs.filter((r) => r.early.change.low > 0).length
    expect(up / runs.length).toBeGreaterThanOrEqual(0.65)
  })
})
