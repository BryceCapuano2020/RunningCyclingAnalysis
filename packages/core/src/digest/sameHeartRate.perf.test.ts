import { describe, expect, it } from 'vitest'
import { DAY_MS, SAME_HEART_RATE } from '../constants'
import { mulberry32 } from '../math'
import { fastestMs } from '../test/timing'
import type { ActivityDigest } from '../types'
import { sameHeartRate } from './sameHeartRate'
import { BASE, MONDAY, heartRatesOf, withBlocks } from './test/sameHeartRateFixture'

/**
 * The work is capped by the blocks in a fit and the weeks reported, not by the library. It took about
 * 17 ms of CPU for the default 12 weeks of a 3,000-activity library and about 90 ms for all time, which
 * reports the newest 52 weeks of each sport. The budgets leave room for a loaded runner while work
 * that grows with the library, or fits more blocks a week, fails them.
 */
const PERIOD_BUDGET_MS = 100
const ALL_TIME_BUDGET_MS = 400

/** 3,000 activities, alternating sport, with 15 steady blocks each, eight a week for years. */
function library(count: number): ActivityDigest[] {
  const random = mulberry32(5)
  const out: ActivityDigest[] = []
  for (let i = 0; i < count; i++) {
    const sport = i % 2 === 0 ? 'run' : 'ride'
    // Eight a week, so a 28-day window holds 16 of a sport and 240 blocks, over the cap.
    const startMs = MONDAY + Math.floor(i / 8) * 7 * DAY_MS + (i % 8) * DAY_MS
    const blocks = [...heartRatesOf(i), ...heartRatesOf(i + 1), ...heartRatesOf(i + 2)].map(
      (heartRate) => ({
        heartRate,
        output: BASE[sport](heartRate) * (1 + (random() - 0.5) * 0.06),
      }),
    )
    out.push(withBlocks(sport, `${sport}-${i}`, startMs, blocks))
  }
  return out
}

describe('output at the same heart rate performance', () => {
  const digests = library(3000)
  const last = Math.max(...digests.map((digest) => digest.startMs))

  it(`reads the default 12 weeks of a 3,000-activity library in under ${PERIOD_BUDGET_MS} ms`, () => {
    let weeks = 0
    const ms = fastestMs(() => {
      const result = sameHeartRate(digests, new Set(), { fromMs: last - 84 * DAY_MS })
      weeks = result.run.weeks.length + result.ride.weeks.length
    })
    expect(weeks).toBeGreaterThan(10)
    expect(ms).toBeLessThan(PERIOD_BUDGET_MS)
  })

  it(`reads the newest year of weeks of the same library in under ${ALL_TIME_BUDGET_MS} ms`, () => {
    let weeks = 0
    const ms = fastestMs(() => {
      const result = sameHeartRate(digests, new Set(), {})
      weeks = result.run.weeks.length + result.ride.weeks.length
    })
    expect(weeks).toBe(2 * SAME_HEART_RATE.maxWeeks)
    expect(ms).toBeLessThan(ALL_TIME_BUDGET_MS)
  })
})
