import { describe, expect, it } from 'vitest'
import { HALF_MARATHON_M } from '../constants'
import { ageGrade } from '../grade'
import type { AnalysisResult } from '../digest/combine'
import { gradeHalf } from './halfGrade'
import { runLevelTimes } from './levelRanges'
import { sportStanding } from './standing'

/** Mid-year, so a 1990 birth is 34 in the calendar sense the grade uses. */
const AT = Date.UTC(2024, 6, 2, 12)
const WOMAN = { birthYear: 1990, sex: 'female' } as const
/** A synthetic forecast: 1:40:00, between 1:35:00 and 1:46:00. */
const HALF = { seconds: 6000, low: 5700, high: 6360, atMs: AT }

describe('gradeHalf', () => {
  it('grades the half on the road standard at the age on its day, the slow end as the low', () => {
    const graded = gradeHalf(HALF, WOMAN)
    expect(graded.kind).toBe('graded')
    if (graded.kind !== 'graded') return
    expect(graded.age).toBe(34)
    expect(graded.grade.centre.grade).toBeCloseTo(
      ageGrade(HALF_MARATHON_M, 6000, 34, 'female')!,
      12,
    )
    expect(graded.grade.range!.low.grade).toBeLessThan(graded.grade.centre.grade)
    expect(graded.grade.range!.high.grade).toBeGreaterThan(graded.grade.centre.grade)
  })

  it('has no range for a forecast whose ends are its time', () => {
    const graded = gradeHalf({ ...HALF, low: 6000, high: 6000 }, WOMAN)
    expect(graded.kind === 'graded' && graded.grade.range).toBeNull()
  })

  it('names the level of the Run table’s band its time falls in, at every level’s edge', () => {
    const bands = runLevelTimes(WOMAN, AT, HALF_MARATHON_M)!
    for (const band of bands) {
      for (const seconds of [band.best, band.worst].filter((s): s is number => s !== null)) {
        const graded = gradeHalf({ seconds, low: seconds, high: seconds, atMs: AT }, WOMAN)
        expect(graded.kind === 'graded' && graded.grade.centre.level).toBe(band.label)
      }
    }
  })

  it('leaves out an age the standards do not cover', () => {
    expect(gradeHalf(HALF, { birthYear: 2020, sex: 'male' }).kind).toBe('gap')
  })
})

describe('sportStanding with a forecast half', () => {
  const EMPTY = {
    activities: [],
    runThreshold: null,
    rideThreshold: null,
    rideThresholdRunSpeed: null,
  } as unknown as AnalysisResult

  it('grades the run by the half, and by its threshold without one', () => {
    const withHalf = sportStanding(EMPTY, WOMAN, undefined, HALF)
    expect(withHalf.grades.run).toEqual(gradeHalf(HALF, WOMAN))
    const without = sportStanding(EMPTY, WOMAN)
    expect(without.grades.run).toEqual({ kind: 'gap', why: 'no-threshold' })
  })

  it('has no run grade without a profile, half or not', () => {
    expect(sportStanding(EMPTY, null, undefined, HALF).grades.run).toEqual({
      kind: 'gap',
      why: 'no-profile',
    })
  })
})
