import { describe, expect, it } from 'vitest'
import { sameCountedRuns } from './countedRuns'
import type { AthleteSettings } from './settings'

describe('sameCountedRuns', () => {
  const base: AthleteSettings = { massKg: 72, bikeMassKg: 9 }

  it('treats no choice and an empty one as the same', () => {
    expect(sameCountedRuns(base, { ...base, countedRuns: [] })).toBe(true)
  })

  it('does not depend on the order of the keys', () => {
    const a = { ...base, countedRuns: ['run-1', 'run-2'] }
    const b = { ...base, countedRuns: ['run-2', 'run-1'] }
    expect(sameCountedRuns(a, b)).toBe(true)
  })

  it('tells a different set from the same size and from a longer one', () => {
    const a = { ...base, countedRuns: ['run-1', 'run-2'] }
    expect(sameCountedRuns(a, { ...base, countedRuns: ['run-1', 'run-3'] })).toBe(false)
    expect(sameCountedRuns(a, { ...base, countedRuns: ['run-1'] })).toBe(false)
    expect(sameCountedRuns(base, a)).toBe(false)
  })
})
