import { describe, expect, it, vi } from 'vitest'

// The latest birth year follows the youngest graded age in core, so a change there moves it too.
vi.mock('@rca/core/grade', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rca/core/grade')>()
  return { ...actual, FIRST_GRADED_AGE: 10 }
})

describe('birth-year limits', () => {
  it('start at 1920, and end at the youngest graded age before this year', async () => {
    const { birthYearLimits, isBirthYear } = await import('./athlete')
    expect(birthYearLimits(2026)).toEqual({ min: 1920, max: 2016 })
    expect(isBirthYear(1920, 2026)).toBe(true)
    expect(isBirthYear(1919, 2026)).toBe(false)
    expect(isBirthYear(2016, 2026)).toBe(true)
    expect(isBirthYear(2017, 2026)).toBe(false)
  })
})
