import { describe, expect, it } from 'vitest'
import { formatDuration } from '../units'
import { durationProfile, profileSentence } from './index'
import { modelCurve, scaled } from './test/curves'

describe('what a small library can say', () => {
  it('says nothing stands out, and never that the bests are in line, with fewer than 40 activities', () => {
    for (const activities of [3, 12, 25, 39]) {
      const profile = durationProfile(modelCurve(), 5, activities)
      if (profile.status !== 'ready') throw new Error('not ready')
      const text = profileSentence(profile, formatDuration)
      expect(text).toBe('Nothing stands out.')
      expect(text).not.toContain('in line')
      expect(text).not.toMatch(/takes \d+ activities/)
    }
  })

  it('says the same from 40 activities, and still never that the bests are in line', () => {
    for (const activities of [40, 400]) {
      const profile = durationProfile(modelCurve(), 5, activities)
      if (profile.status !== 'ready') throw new Error('not ready')
      const text = profileSentence(profile, formatDuration)
      expect(text).toBe('Nothing stands out.')
      expect(text).not.toContain('in line')
    }
  })

  it('names the window of the whole library as all-time bests where it names a best, and leaves it out of nothing standing out', () => {
    const small = durationProfile(modelCurve(), 5, 12)
    const full = durationProfile(modelCurve(), 5, 40)
    if (small.status !== 'ready' || full.status !== 'ready') throw new Error('not ready')
    expect(profileSentence(small, formatDuration, { allTime: true })).toBe('Nothing stands out.')
    expect(profileSentence(full, formatDuration, { allTime: true })).toBe('Nothing stands out.')
    const standing = durationProfile(scaled(1200, 1.4), 5, 40)
    if (standing.status !== 'ready') throw new Error('not ready')
    expect(profileSentence(standing, formatDuration, { allTime: true })).toMatch(
      /^Your all-time 20 min best is \d+% above what your other bests suggest\./,
    )
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
