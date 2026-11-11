import { describe, expect, it } from 'vitest'
import { GRADE_LEVELS } from '@rca/core/grade'
import { LIFT_LEVEL_MEANING, OWN_LEVEL_MEANING, levelMeaningLine } from './levelMeaning'

describe('level meanings', () => {
  it('defines every level, highest first, once each, as a clause that ends the line', () => {
    const all = GRADE_LEVELS.map((band) => band.label)
    expect(OWN_LEVEL_MEANING.map((level) => level.name)).toEqual(all)
    for (const level of OWN_LEVEL_MEANING) expect(level.meaning).toMatch(/^[a-z].*\.$/)
    expect(LIFT_LEVEL_MEANING.map((level) => level.name)).toEqual(all)
    for (const level of LIFT_LEVEL_MEANING) expect(level.meaning).toMatch(/^[a-z].*\.$/)
  })

  it('speaks of meets, not races, for lifting', () => {
    expect(levelMeaningLine('Local', true)).toBe('You win your class at a local meet.')
    for (const level of LIFT_LEVEL_MEANING) expect(level.meaning).not.toMatch(/race|strength/i)
  })

  it('gives a meaning as a line that starts with a capital, and nothing for a name that is not a level', () => {
    expect(levelMeaningLine('Club')).toBe('You hold your own in a club race.')
    expect(levelMeaningLine('Master')).toBeUndefined()
  })
})
