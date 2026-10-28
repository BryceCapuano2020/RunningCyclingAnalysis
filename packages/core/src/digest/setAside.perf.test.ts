import { describe, expect, it } from 'vitest'
import { fastestMs } from '../test/timing'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest } from '../types'
import { digestActivity } from './digestActivity'
import { heartRateSetAsideOf } from './setAside'

/**
 * The library-wide judgement of whose heart rate is set aside runs once per library change, so a period
 * switch costs nothing. On 2,000 activities it takes about 120 ms locally, well under the 300 ms of the
 * analysis it replaces for each period; the budget is three times that, so a pass per effort for each
 * activity, or a judgement per period, fails it.
 */
const BUDGET_MS = 400
const ACTIVITIES = 2000

describe('heartRateSetAsideOf performance', () => {
  it(`judges ${ACTIVITIES} activities in under ${BUDGET_MS} ms`, () => {
    const base = sampleDataset().activities.map((activity) => digestActivity(activity))
    const library: ActivityDigest[] = Array.from({ length: ACTIVITIES }, (_, i) => {
      const source = base[i % base.length]!
      return Object.assign({}, source, {
        id: `a${i}`,
        startMs: source.startMs + Math.floor(i / base.length) * 3_600_000,
      })
    })
    const settings = { massKg: 75, bikeMassKg: 9 }
    const ms = fastestMs(() => heartRateSetAsideOf(library, settings), 3)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
