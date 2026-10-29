import { describe, expect, it } from 'vitest'
import { DAY_MS } from '../constants'
import { episodesOf, expectFinds, expectSilence, replayDetector } from './test/harness'
import { nullLibraries, plantedLibrary } from './test/plantedLibrary'
import { protoSameHeartRate } from './test/protoEfficiency'

const WEEK_MS = 7 * DAY_MS
/** Each case replays libraries week by week, a minute and more under coverage or on a loaded runner. */
const TIMEOUT_MS = 180_000

describe('the engine on a series of the kind it will see: a prototype of the same-heart-rate detector', () => {
  const episodes = (spec: Parameters<typeof plantedLibrary>[0]) => {
    const lib = plantedLibrary(spec)
    return { lib, found: episodesOf(replayDetector(protoSameHeartRate, lib).marks) }
  }

  it(
    'speaks of a step once, a few weeks after it, with the sign and size planted',
    () => {
      const report = expectFinds(
        protoSameHeartRate,
        {
          weeks: 56,
          perWeek: 4,
          noise: 0.02,
          effects: [{ type: 'efficiency-shift', atWeek: 34, size: 0.06 }],
        },
        { seeds: 6, lagWeeks: 12, sign: 1, size: { relativeTolerance: 0.4 } },
      )
      expect(report.rate).toBeGreaterThanOrEqual(0.9)
    },
    TIMEOUT_MS,
  )

  it(
    'speaks of a steady improvement once at most, when it starts, and is silent as it goes on',
    () => {
      // 0.6% a week from week 20: the same-heart-rate fit rises 4.8% over every eight weeks, which is
      // what it has always done once it has begun. Seeds 1 to 4: no library gets more than two
      // findings, and the second, when there is one, is a material change (the ledger's rule) after a gap.
      const counts = [1, 2, 3, 4].map((seed) => {
        const { lib, found } = episodes({
          seed,
          weeks: 60,
          perWeek: 4,
          noise: 0.02,
          effects: [{ type: 'efficiency-ramp', atWeek: 20, size: 0.006 }],
        })
        expect(found[0]!.startMs).toBeGreaterThan(lib.firstMs + 24 * WEEK_MS)
        expect(found[0]!.finding.effect).toBeGreaterThan(0)
        return found.length
      })
      expect(Math.max(...counts)).toBeLessThanOrEqual(2)
      expect(counts.reduce((total, n) => total + n, 0)).toBeLessThanOrEqual(5)
    },
    TIMEOUT_MS,
  )

  it(
    'speaks of a reversal after a ramp, ranked higher than the same finding going on',
    () => {
      const { lib, found } = episodes({
        seed: 2,
        weeks: 100,
        perWeek: 4,
        noise: 0.02,
        effects: [
          { type: 'efficiency-ramp', atWeek: 26, size: 0.006 },
          { type: 'efficiency-ramp', atWeek: 56, size: -0.012 },
        ],
      })
      expect(Math.sign(found[0]!.finding.effect)).toBe(1)
      const reversal = found.find((e) => e.finding.effect < 0)!
      expect(reversal.startMs).toBeGreaterThan(lib.firstMs + 56 * WEEK_MS)
      // Judged against a history of rising, a fall is what it has not done: it is lifted, not damped.
      expect(reversal.finding.surprise).toBeGreaterThan(0.6)
    },
    TIMEOUT_MS,
  )

  it(
    'calibration: in an athlete-year of nothing changing it speaks a twentieth of the time or less; wandering fitness is measured, not hidden',
    () => {
      // Independent seeds for each size of the grid, one library at each: 10.5 athlete-years.
      const plain = nullLibraries({ perCell: 1 })
      const quiet = expectSilence(protoSameHeartRate, plain, {
        perAthleteYear: 0.2,
        minAthleteYears: 10,
      })
      expect(quiet.rate).toBeLessThanOrEqual(0.2)
      // Fitness that wanders from week to week (AR(1), 0.8) really does change by 5% every so often,
      // so the prototype speaks of it. The engine's gates bring that to under a finding a year, not to
      // the design's 0.5: a detector that reads this series must also hold itself to what is usual.
      const wandering = nullLibraries({ perCell: 1, base: 1, noiseModel: { autocorrelation: 0.8 } })
      let episodeCount = 0
      let weeks = 0
      for (const lib of wandering) {
        episodeCount += episodesOf(replayDetector(protoSameHeartRate, lib).marks).length
        weeks += lib.spec.weeks
      }
      expect(episodeCount / (weeks / 52)).toBeLessThan(1.5)
    },
    TIMEOUT_MS,
  )
})
