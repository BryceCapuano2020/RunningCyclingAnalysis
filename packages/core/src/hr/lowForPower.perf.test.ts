import { describe, expect, it } from 'vitest'
import { copiedLibrary } from '../test/libraryFixture'
import { fastestMs } from '../test/timing'
import { lowForPowerSetAside } from './lowForPower'

/**
 * The line is fitted to at most a fixed number of activities, so the pairwise slopes stay few however large the
 * library is. Locally 2,000 activities take about 10 ms with their levels worked out, and the first call, which
 * works them out, a little more; the budget leaves room for a loaded runner while fitting every activity
 * (some 2 million slopes) still fails it.
 */
const BUDGET_MS = 60

describe('heart rate that reads low for the power: cost', () => {
  it(`judges a library of 2,000 activities in under ${BUDGET_MS} ms`, () => {
    const digests = copiedLibrary(2000)
    let judged = 0
    const ms = fastestMs(() => {
      judged = lowForPowerSetAside(digests).size
    }, 5)
    // Keeping the result means none of the timed work can be skipped.
    expect(judged).toBeGreaterThanOrEqual(0)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
