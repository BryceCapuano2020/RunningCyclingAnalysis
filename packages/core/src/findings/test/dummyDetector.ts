import { SPORT_ADAPTERS } from '../adapters'
import { rankTest } from '../rankTest'
import { surpriseInputOf } from '../score'
import { clusterBootstrapDiff, seedFrom } from '../stats'
import type { Candidate, Detector } from '../types'

const WEEK_MS = 7 * 86_400_000
const RECENT = 8

/**
 * Detectors that prove the harness and the engine, not findings anyone would ship. This one reads weekly
 * time on the move, the last 8 complete weeks against the 8 before, for a sport. It speaks when the mean
 * moved by at least `minChange` (0.25 is the dummy's; a smaller one is noisier), the rank test has
 * p under 0.05 and the cluster bootstrap (weeks as clusters) sides with the move.
 */
export function volumeDetector(id: string, minChange: number): Detector {
  return {
    id,
    kind: 'pattern',
    sports: ['run', 'ride'],
    minHistoryWeeks: 16,
    run(input, sport): Candidate[] {
      const weeks = input.tables.weeklyMoving[sport].filter((w) => w.complete)
      if (weeks.length < 2 * RECENT) return []
      const recent = weeks.slice(-RECENT)
      const prior = weeks.slice(-2 * RECENT, -RECENT)
      const mean = (xs: readonly { seconds: number }[]) =>
        xs.reduce((s, w) => s + w.seconds, 0) / xs.length
      const effect = mean(recent) / mean(prior) - 1
      if (!(Math.abs(effect) >= minChange)) return []
      const test = rankTest(
        recent.map((w) => w.seconds),
        prior.map((w) => w.seconds),
      )
      const groupsOf = (xs: typeof recent) => xs.map((w) => [w.seconds])
      const meanOf = (g: readonly (readonly number[])[]) =>
        g.flat().reduce((s, v) => s + v, 0) / g.length
      const asOfMs = recent.at(-1)!.endMs
      const boot = clusterBootstrapDiff(
        groupsOf(recent),
        groupsOf(prior),
        (a, b) => meanOf(a) / meanOf(b) - 1,
        seedFrom(id, sport, asOfMs),
      )
      if (!(test.p < 0.05) || boot.estimate === 0) return []
      const rolling = weeks.map((_, i) =>
        i < RECENT - 1 ? Number.NaN : mean(weeks.slice(i - RECENT + 1, i + 1)),
      )
      const adapter = SPORT_ADAPTERS[sport]
      return [
        {
          subject: 'weekly-time',
          sports: [sport],
          direction: 'neutral',
          effect,
          window: { fromMs: recent[0]!.endMs - WEEK_MS, toMs: asOfMs },
          baseline: { fromMs: prior[0]!.endMs - WEEK_MS, toMs: prior.at(-1)!.endMs - WEEK_MS },
          headline: `Your ${adapter.noun} time a week is ${Math.round(Math.abs(effect) * 100)}% ${effect > 0 ? 'higher' : 'lower'} than the 8 weeks before.`,
          numbers: [
            { key: 'change', value: effect, unit: 'fraction', low: boot.low, high: boot.high },
          ],
          evidence: recent.map((w) => ({ type: 'week' as const, endMs: w.endMs })),
          support: {
            sign: { kind: 'agree', share: boot.agree },
            n: recent.length + prior.length,
            nNeeded: 2 * RECENT,
            robust: true,
          },
          surprise: surpriseInputOf(rolling.map(Math.log), RECENT),
          method: {
            test: 'rank test with cluster bootstrap',
            n: recent.length + prior.length,
            exclusions: [],
          },
          asOfMs,
        },
      ]
    },
  }
}

/** The harness's own check: a quiet volume detector (25% or more). */
export const dummyVolumeDetector = volumeDetector('dummy-volume', 0.25)
