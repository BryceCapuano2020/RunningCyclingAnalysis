import { describe, expect, it } from 'vitest'
import { copiedLibrary } from '../test/libraryFixture'
import { fastestMs } from '../test/timing'
import { mergeDistributions } from './distributionMerge'

/**
 * Summing the heart-rate, power and speed distributions of 2,000 activities, for both sports, takes
 * under a millisecond locally: one add per bin of each activity. The budget is twenty times that, so a
 * copy of the counts per activity, or a pass over every bin of the measure per activity, fails it.
 */
const BUDGET_MS = 15
const ACTIVITIES = 2000

describe('distribution merge performance', () => {
  const digests = copiedLibrary(ACTIVITIES)

  it(`merges every measure of ${ACTIVITIES} activities in under ${BUDGET_MS} ms`, () => {
    let seconds = 0
    const ms = fastestMs(() => {
      seconds = 0
      for (const sport of ['run', 'ride'] as const) {
        for (const measure of ['heartRate', 'power', 'speed'] as const) {
          seconds += mergeDistributions(digests, sport, measure)?.seconds ?? 0
        }
      }
    })
    // Keeping the result means none of the timed work can be skipped.
    expect(seconds).toBeGreaterThan(0)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
