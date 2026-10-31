import { describe, expect, it } from 'vitest'
import { runCeilingSpeed } from '../curves/runCeiling'
import { FIRST_GRADED_DISTANCE_M, ageGradeForEffort, gradeCeiling } from './ageGrade'
import type { Sex } from './ageGrade'

const DURATIONS_S = [300, 600, 1200, 1800, 3600, 7200]
const AGES = [5, 25, 65, 100]
const SEXES: Sex[] = ['male', 'female']

describe('gradeCeiling', () => {
  it('is a grade above 0 and at most 100% for every length, age and sex', () => {
    for (const durationS of DURATIONS_S) {
      for (const age of AGES) {
        for (const sex of SEXES) {
          const ceiling = gradeCeiling(durationS, age, sex)
          expect(ceiling, `${durationS} s, ${age}, ${sex}`).not.toBeNull()
          expect(ceiling!).toBeGreaterThan(0)
          expect(ceiling!).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('is the lower of 100% and the grade of the running record’s speed', () => {
    for (const durationS of DURATIONS_S) {
      for (const age of AGES) {
        const atRecord = ageGradeForEffort(runCeilingSpeed(durationS), durationS, age, 'male')!
        expect(gradeCeiling(durationS, age, 'male')).toBe(Math.min(1, atRecord))
      }
    }
  })

  it('is no higher, to a tenth of a point, for an older or a female athlete than for a young man', () => {
    // Where the open record sits a hair under a young man's 100%, an older athlete's age standard is
    // reached first, so the cap there is 100% itself: the ceilings differ by under a tenth of a point.
    for (const durationS of DURATIONS_S) {
      const young = gradeCeiling(durationS, 25, 'male')!
      for (const [age, sex] of [
        [65, 'male'],
        [65, 'female'],
        [25, 'female'],
        [100, 'female'],
      ] as const) {
        expect(gradeCeiling(durationS, age, sex)!).toBeLessThanOrEqual(young + 0.001)
      }
    }
  })

  it('is null where the record’s distance is under the shortest standard, a mile', () => {
    // 2 minutes at the record speed is under a mile, so no standard bounds the length.
    expect(runCeilingSpeed(120) * 120).toBeLessThan(FIRST_GRADED_DISTANCE_M)
    for (const age of AGES) {
      for (const sex of SEXES) expect(gradeCeiling(120, age, sex)).toBeNull()
    }
    // And is not null once the record covers a mile.
    expect(runCeilingSpeed(600) * 600).toBeGreaterThan(FIRST_GRADED_DISTANCE_M)
  })

  it('is null for an age the standards do not cover', () => {
    expect(gradeCeiling(1200, 4, 'male')).toBeNull()
    expect(gradeCeiling(1200, 101, 'female')).toBeNull()
    expect(gradeCeiling(1200, 25.5, 'male')).toBeNull()
  })
})
