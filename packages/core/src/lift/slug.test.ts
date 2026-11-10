import { describe, expect, it } from 'vitest'
import { LIFT_EXERCISE_PATTERN } from './limits'
import { slugify, slugifyFull } from './slug'

describe('slugify', () => {
  it('makes lower-case hyphenated words', () => {
    expect(slugify('  Bulgarian Split  squat! ')).toBe('bulgarian-split-squat')
  })
  it('drops accents', () => {
    expect(slugify('Café curl')).toBe('cafe-curl')
    expect(slugify('Écarté (Haltère)')).toBe('ecarte-haltere')
  })
  it('keeps only a-z and 0-9, and is null when nothing is left', () => {
    expect(slugify('Zercher (2 sec) squat')).toBe('zercher-2-sec-squat')
    expect(slugify('★ !!')).toBeNull()
  })
  it('stops at 48 characters without a trailing hyphen', () => {
    const slug = slugify('word '.repeat(30)) as string
    expect(slug.length).toBeLessThanOrEqual(48)
    expect(slug).toMatch(LIFT_EXERCISE_PATTERN)
    expect(slugify(`${'a'.repeat(47)} b`)).toBe('a'.repeat(47))
    expect(slugifyFull('word '.repeat(30)).length).toBeGreaterThan(48)
  })
})
