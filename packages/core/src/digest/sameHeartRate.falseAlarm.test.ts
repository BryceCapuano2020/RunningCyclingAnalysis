import { describe, expect, it } from 'vitest'
import { mulberry32, normal } from '../math'
import { sameHeartRate } from './sameHeartRate'
import { MONDAY, weeksOf } from './test/sameHeartRateFixture'

/**
 * The claim "a real change" is made on 90% intervals that must not overlap, so it should be made
 * for an output that did not change in well under 5% of libraries. Each library here has an output
 * that never changes, a day-to-day spread of 2% between activities and 2% between blocks, which is
 * what a bootstrap over few activities has to be honest about. Seeded, so the rates are the same on
 * every run. With the percentile bootstrap this replaced and a minimum of four activities, one a week gave
 * 8 in 100; the rates now are 0 of 180 reporting libraries for a quarter of two a week skipped, 1 of 180
 * for two a week and 2 of 180 for four, and one a week never reports, since four weeks hold four activities.
 */
const MAX_FALSE_ALARM_RATE = 0.05
const WEEKS = [8, 14, 20]
const REPS = 60
/** Each case fits about 500 libraries, a few seconds idle and more on a loaded runner. */
const TIMEOUT_MS = 120_000

function simulate(perWeek: number, dropout: number): { rate: number; reported: number } {
  let reported = 0
  let alarms = 0
  for (const weeks of WEEKS) {
    for (let rep = 0; rep < REPS; rep++) {
      const random = mulberry32(1000 * perWeek + 17 * weeks + rep)
      const effect = () => 1 + 0.02 * normal(random)
      const all = weeksOf('ride', weeks, () => 1, effect, perWeek, effect)
      // A skipped activity now and then, so the windows sit near the minimum number of activities.
      const digests = all.filter(() => random() >= dropout)
      const { change } = sameHeartRate(digests, new Set(), { fromMs: MONDAY }).ride
      if (change === null) continue
      reported++
      if (change.real) alarms++
    }
  }
  return { rate: reported === 0 ? 0 : alarms / reported, reported }
}

/** Each case is simulated once, however many tests read it. */
const results = new Map<string, { rate: number; reported: number }>()
function rateFor(perWeek: number, dropout = 0): { rate: number; reported: number } {
  const key = `${perWeek}/${dropout}`
  if (!results.has(key)) results.set(key, simulate(perWeek, dropout))
  return results.get(key)!
}

describe('false changes when the output never changes', () => {
  it.each([1, 2, 4])(
    'are rare, under 5 in 100, with %d activities a week over 8 to 20 weeks',
    (perWeek) => {
      expect(rateFor(perWeek).rate).toBeLessThan(MAX_FALSE_ALARM_RATE)
    },
    TIMEOUT_MS,
  )

  it(
    'are rare when a quarter of two a week are skipped, so windows sit near the minimum',
    () => {
      const { rate, reported } = rateFor(2, 0.25)
      expect(reported).toBeGreaterThan(50)
      expect(rate).toBeLessThan(MAX_FALSE_ALARM_RATE)
    },
    TIMEOUT_MS,
  )

  it(
    'are tested on libraries that report: two and four activities a week do, one does not',
    () => {
      expect(rateFor(1).reported).toBe(0)
      expect(rateFor(2).reported).toBeGreaterThan(100)
      expect(rateFor(4).reported).toBeGreaterThan(100)
    },
    TIMEOUT_MS,
  )
})
