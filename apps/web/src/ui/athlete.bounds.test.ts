import { describe, expect, it, vi } from 'vitest'

// The birth-year limits follow the ages the standards grade, so a change in core moves them too.
vi.mock('@rca/core/grade', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rca/core/grade')>()
  return { ...actual, FIRST_GRADED_AGE: 10, LAST_GRADED_AGE: 90 }
})

describe('birth-year limits', () => {
  it('follow the first and last graded ages in core', async () => {
    const { birthYearLimits, isBirthYear } = await import('./athlete')
    expect(birthYearLimits(2026)).toEqual({ min: 1936, max: 2016 })
    expect(isBirthYear(1936, 2026)).toBe(true)
    expect(isBirthYear(1935, 2026)).toBe(false)
    expect(isBirthYear(2017, 2026)).toBe(false)
  })
})
