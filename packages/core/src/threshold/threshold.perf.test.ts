import { describe, expect, it } from 'vitest'
import { fastestMs } from '../test/timing'
import { rideThreshold } from './estimate'
import { RIDER } from './test/rides'
import { season } from './test/season'

/**
 * One call over a 26-week window of 20 rides with 280 blocks, so the heart-rate line takes its 280 points and 39,000 slopes.
 * It takes about 2 ms. Sorting the slopes with a comparator, as the first version did, took it to 7 ms, which this budget
 * fails; it leaves room for a runner twice as slow as the one it was set on.
 */
const BUDGET_MS = 5

describe('the ride threshold: cost', () => {
  it(`takes a 26-week window of 20 rides, with a heart-rate line, in under ${BUDGET_MS} ms`, () => {
    const { efforts, blocks } = season()
    let result = rideThreshold(efforts, blocks, RIDER.thresholdHr)
    const ms = fastestMs(() => {
      result = rideThreshold(efforts, blocks, RIDER.thresholdHr)
    }, 7)
    // The line and the heart-rate estimate were made, so none of the timed work was skipped.
    expect(result?.heartRate).toMatchObject({ efforts: expect.any(Number) })
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
