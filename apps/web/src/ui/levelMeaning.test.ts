import { describe, expect, it } from 'vitest'
import { GRADE_LEVELS } from '@rca/core/grade'
import { OWN_LEVEL_MEANING } from './levelMeaning'

describe('level meanings', () => {
  it('defines every level below Local, highest first, once each, as a clause that ends the line', () => {
    const own = GRADE_LEVELS.filter((band) => band.min < 0.6).map((band) => band.label)
    expect(OWN_LEVEL_MEANING.map((level) => level.name)).toEqual(own)
    for (const level of OWN_LEVEL_MEANING) expect(level.meaning).toMatch(/^[a-z].*\.$/)
  })
})
