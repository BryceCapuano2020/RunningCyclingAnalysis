import { SPORT_ADAPTERS } from '../adapters'
import { counted } from '../copy'
import { surpriseInputOf } from '../score'
import { fitDifference } from '../stats'
import type { Candidate, Detector } from '../types'
import type { SameHeartRateWeek } from '../../digest/sameHeartRateTypes'

const DAY_MS = 86_400_000
const LAG_WEEKS = 8
const MIN_Z = 2.2

const estimate = (week: SameHeartRateWeek) => ({
  value: week.fit!.output,
  low: week.fit!.low,
  high: week.fit!.high,
  n: week.activities,
})

/**
 * A prototype of the first real detector, to try the engine on a series of the kind it will see, not
 * to ship: the library-wide same-heart-rate fit this week against the fit 8 weeks earlier, spoken when
 * their intervals are 2.2 standard errors apart and the change is the sport's smallest worth saying.
 */
export const protoSameHeartRate: Detector = {
  id: 'proto-same-hr',
  kind: 'efficiency',
  sports: ['run', 'ride'],
  minHistoryWeeks: 20,
  run(input, sport): Candidate[] {
    const fits = input.tables.sameHeartRate[sport]
    const last = fits.weeks.at(-1)
    const prior = fits.weeks.at(-1 - LAG_WEEKS)
    if (last?.fit == null || prior?.fit == null || last.endMs > input.asOfMs) return []
    const adapter = SPORT_ADAPTERS[sport]
    const change = fitDifference(estimate(prior), estimate(last))
    const relative = last.fit.output / prior.fit.output - 1
    if (!(Math.abs(change.z) >= MIN_Z) || !(Math.abs(relative) >= adapter.minRelativeChange))
      return []
    const step = adapter.difference(prior.fit.output, last.fit.output, 'metric')
    return [
      {
        subject: 'same-hr',
        sports: [sport],
        direction: relative > 0 ? 'better' : 'worse',
        effect: relative,
        window: { fromMs: last.endMs - 28 * DAY_MS, toMs: last.endMs },
        baseline: { fromMs: prior.endMs - 28 * DAY_MS, toMs: prior.endMs },
        headline: `At ${fits.referenceHeartRate} bpm your ${adapter.outputName} is ${step.amount} ${step.word} than ${counted(LAG_WEEKS, 'week')} ago.`,
        numbers: [
          {
            key: 'now',
            value: last.fit.output,
            unit: 'output',
            low: last.fit.low,
            high: last.fit.high,
          },
          {
            key: 'before',
            value: prior.fit.output,
            unit: 'output',
            low: prior.fit.low,
            high: prior.fit.high,
          },
        ],
        evidence: [
          { type: 'week', endMs: last.endMs },
          { type: 'week', endMs: prior.endMs },
        ],
        support: {
          sign: { kind: 'z', z: change.z, degrees: change.degrees },
          n: Math.min(last.activities, prior.activities),
          nNeeded: 6,
          robust: true,
        },
        surprise: surpriseInputOf(
          fits.weeks.map((w) => w.fit?.output ?? Number.NaN),
          LAG_WEEKS,
        ),
        method: {
          test: 'fit against fit',
          n: last.activities + prior.activities,
          exclusions: ['indoor runs'],
        },
        asOfMs: last.endMs,
      },
    ]
  },
}
