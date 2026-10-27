import { describe, expect, it } from 'vitest'
import { DURATIONS_S } from '../constants'
import { fastestMs } from '../test/timing'
import { durationProfile } from './index'
import type { ProfilePoint } from './index'

/**
 * A page computes the profile on the main thread when it opens, so a full curve of 21 points must not
 * hold it for long. It took about 15 to 25 ms before the shape search was cut to a short grid and its
 * arrays were reused. The budget leaves room for a loaded runner while a return to that cost fails it.
 */
const BUDGET_MS = 40

/** A full curve from Morton's model for a 250 W rider, set across four sessions. */
const CURVE: ProfilePoint[] = DURATIONS_S.map((durationS, i) => ({
  durationS,
  value: 250 + 20_000 / (durationS + 20_000 / 750) + (i % 3),
  sessionId: `session-${i % 4}`,
}))

describe('duration profile performance', () => {
  it(`profiles a curve of ${CURVE.length} points in under ${BUDGET_MS} ms`, () => {
    let rows = 0
    const ms = fastestMs(() => {
      const profile = durationProfile(CURVE)
      rows = profile.status === 'ready' ? profile.rows.length : 0
    })
    // Keeping the result means none of the timed work can be skipped.
    expect(rows).toBeGreaterThan(10)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
