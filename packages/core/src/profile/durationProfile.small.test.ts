import { describe, expect, it } from 'vitest'
import { formatDuration } from '../units'
import { durationProfile, profileSentence } from './index'
import { modelCurve, scaled } from './test/curves'

describe('what a small library can say', () => {
  it('does not say the bests are in line with each other with fewer than 40 activities behind them', () => {
    const few = durationProfile(modelCurve(), 5, 25)
    if (few.status !== 'ready') throw new Error('not ready')
    const text = profileSentence(few, formatDuration)
    expect(text).not.toContain('in line with')
    expect(text).toContain('takes 40 activities to say they agree; this period has 25')
    const enough = durationProfile(modelCurve(), 5, 40)
    if (enough.status !== 'ready') throw new Error('not ready')
    expect(profileSentence(enough, formatDuration)).toContain('in line with each other')
  })

  it('judges a duration at a stricter level in a small library, and shrinks what stands out', () => {
    const points = scaled(1200, 1.15)
    const flagged = (activities: number) => {
      const profile = durationProfile(points, 5, activities)
      if (profile.status !== 'ready') throw new Error('not ready')
      return profile.rows.find((row) => row.durationS === 1200)!
    }
    const large = flagged(40)
    const small = flagged(5)
    expect(large.standsOut).toBe('above')
    expect(small.standsOut).toBeNull()
    // The size reported is below the raw 15%: the duration noise helped most is pulled toward the curve.
    expect(large.residual).toBeGreaterThan(0.08)
    expect(large.residual).toBeLessThan(0.15)
    expect(large.low).toBeGreaterThan(0)
  })

  it('draws a bar of some width for a duration only just past the cut', () => {
    for (let step = 100; step <= 130; step++) {
      const profile = durationProfile(scaled(1200, step / 100), 5, 40)
      if (profile.status !== 'ready') throw new Error('not ready')
      const row = profile.rows.find((one) => one.durationS === 1200)!
      if (row.standsOut === null) continue
      // The first multiplier that stands out is the one just past the cut.
      expect(row.high - row.low).toBeGreaterThan(0.001)
      expect(row.low).toBeGreaterThan(0)
      expect(row.residual).toBeGreaterThan(row.low)
      expect(row.residual).toBeLessThan(row.high)
      return
    }
    throw new Error('no multiplier stood out')
  })
})
