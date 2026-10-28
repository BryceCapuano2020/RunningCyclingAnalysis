import { describe, expect, it } from 'vitest'
import { copiedLibrary } from '../test/libraryFixture'
import { fastestMs } from '../test/timing'
import { lateEvidence } from './lateEvidence'

/**
 * The late-effort evidence of a 2,000-activity library, read every time the period or the set-aside
 * changes, takes about 1 ms locally: one pass over the digests for each duration and for the drift.
 * The budget is twenty times that, so a search inside a search, or a sort of the whole library per
 * point, fails it while a loaded runner does not.
 */
const BUDGET_MS = 20
const ACTIVITIES = 2000

describe('late-effort evidence performance', () => {
  const digests = copiedLibrary(ACTIVITIES)

  it(`reads the durability and drift of ${ACTIVITIES} activities in under ${BUDGET_MS} ms`, () => {
    let drift = 0
    let rows = 0
    const ms = fastestMs(() => {
      const evidence = lateEvidence(digests, new Set())
      drift = evidence.run.drift.length + evidence.ride.drift.length
      rows = evidence.run.durability.length + evidence.ride.durability.length
    })
    // Keeping the result means none of the timed work can be skipped.
    expect(rows).toBeGreaterThan(0)
    expect(drift).toBeGreaterThan(0)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
