import { describe, expect, it } from 'vitest'
import { check, fc } from '../test/property'
import {
  FIRST_GRADED_DISTANCE_M,
  LAST_GRADED_DISTANCE_M,
  ageGrade,
  ageGradeForEffort,
  ageStandardSeconds,
  type Sex,
} from './ageGrade'

/*
 * Grades follow from the published standards. Covering the same distance sooner never lowers the grade, holding a faster
 * speed for the same time never lowers it, and a standard is a time that grows with distance. Ages are the adult ones, where
 * the table is smooth: the table keeps two published anomalies at the age extremes (see ageStandardSeconds).
 */

const sex = fc.constantFrom<Sex>('female', 'male')
const adultAge = fc.integer({ min: 20, max: 90 })
const distance = fc.double({
  min: FIRST_GRADED_DISTANCE_M,
  max: LAST_GRADED_DISTANCE_M,
  noNaN: true,
})

describe('age grade', () => {
  it('does not fall when the same distance is covered in less time', () => {
    check(
      fc.property(
        distance,
        fc.double({ min: 60, max: 100_000, noNaN: true }),
        fc.double({ min: 0, max: 50_000, noNaN: true }),
        adultAge,
        sex,
        (d, time, saved, age, s) => {
          const slow = ageGrade(d, time + saved + 1, age, s)!
          const fast = ageGrade(d, time, age, s)!
          expect(fast).toBeGreaterThanOrEqual(slow)
        },
      ),
      300,
    )
  })

  it('does not fall when a faster speed is held for the same time', () => {
    check(
      fc.property(
        fc.double({ min: 60, max: 36_000, noNaN: true }),
        fc.double({ min: 1.5, max: 6, noNaN: true }),
        fc.double({ min: 0, max: 3, noNaN: true }),
        adultAge,
        sex,
        (duration, speed, extra, age, s) => {
          const slow = ageGradeForEffort(speed, duration, age, s)
          const fast = ageGradeForEffort(speed + extra, duration, age, s)
          // Outside the graded distances there is no standard, which is a null and no claim.
          if (slow !== null && fast !== null) expect(fast).toBeGreaterThanOrEqual(slow)
        },
      ),
      300,
    )
  })

  it('has a standard that grows with distance and with age past thirty', () => {
    check(
      fc.property(distance, distance, fc.integer({ min: 30, max: 89 }), sex, (a, b, age, s) => {
        const [near, far] = a <= b ? [a, b] : [b, a]
        // Equal published cells interpolate to equal times up to rounding, so the order holds to a relative 1e-9.
        const atLeast = (high: number, low: number) =>
          expect(high).toBeGreaterThanOrEqual(low * (1 - 1e-9))
        atLeast(ageStandardSeconds(far, age, s)!, ageStandardSeconds(near, age, s)!)
        atLeast(ageStandardSeconds(near, age + 1, s)!, ageStandardSeconds(near, age, s)!)
      }),
      300,
    )
  })

  it('is the standard over the time, so a time equal to the standard grades 1', () => {
    check(
      fc.property(distance, adultAge, sex, (d, age, s) => {
        expect(ageGrade(d, ageStandardSeconds(d, age, s)!, age, s)).toBeCloseTo(1, 12)
      }),
      200,
    )
  })
})
