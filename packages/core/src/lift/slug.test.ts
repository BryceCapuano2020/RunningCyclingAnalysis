import { describe, expect, it } from 'vitest'
import { LIFT_EXERCISE_PATTERN } from './limits'
import { exerciseInfo } from './catalog'
import { assistedSlug, slugify } from './slug'

describe('slugify', () => {
  it('makes lower-case hyphenated words', () => {
    expect(slugify('  Bulgarian Split  squat! ')).toBe('bulgarian-split-squat')
  })
  it('drops accents', () => {
    expect(slugify('Café curl')).toBe('cafe-curl')
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
  })
})

describe('assisted slugs', () => {
  it('a typed name never reads as assisted, whatever its cut', () => {
    const typed = slugify('Assisted dip') as string
    expect(typed).toBe('custom-assisted-dip')
    expect(exerciseInfo(typed).assisted).toBeUndefined()
    expect(exerciseInfo(slugify(`assisted ${'x'.repeat(60)}`) as string).assisted).toBeUndefined()
  })
  it('only assistedSlug makes an assisted lift, within the length limit', () => {
    const slug = assistedSlug('Dip') as string
    expect(slug).toBe('assisted-dip')
    expect(exerciseInfo(slug).assisted).toBe(true)
    expect((assistedSlug('x'.repeat(60)) as string).length).toBeLessThanOrEqual(48)
    expect(assistedSlug('★')).toBeNull()
  })
})
