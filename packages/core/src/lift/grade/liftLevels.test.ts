import { describe, expect, it } from 'vitest'
import { GRADE_LEVELS } from '../../grade/ageGrade'
import { lbToKg } from '../../units'
import type { LiftEstimate } from '../estimate'
import { liftCornerGrade } from './liftGrade'
import { liftLevelTotals } from './liftLevels'
import { liftAgeOn, liftStandard } from './liftStandard'
import { LIFTS } from './standard'

const MAN = { birthYear: 1994, sex: 'male' } as const
const WOMAN = { birthYear: 1994, sex: 'female' } as const
const DATE = '2024-07-02'

function est(point: number): LiftEstimate {
  return {
    date: DATE,
    point,
    point0: point,
    low: point * 0.9,
    high: point * 1.1,
    floor: { loadKg: point * 0.9, reps: 3, date: DATE },
    sessions: 5,
    sd: 0.05,
    terms: { curve: 0, centre: 0, equations: 0, effort: 0 },
    ind: 0.03,
    meanR: 5,
  }
}

/**
 * The corner grade of a total split over the three lifts in the shares of their standards, so no lift sits over the corner's
 * ceiling and drops out.
 */
function cornerOf(profile: typeof MAN | typeof WOMAN, massKg: number, totalKg: number) {
  const age = liftAgeOn(profile.birthYear, DATE)
  const standards = LIFTS.map((lift) => liftStandard(lift, profile.sex, age, massKg).kg)
  const sum = standards.reduce((a, b) => a + b, 0)
  const lifts = LIFTS.map((lift, i) => ({ lift, estimate: est((totalKg * standards[i]!) / sum) }))
  const out = liftCornerGrade(lifts, profile, { massKg })
  if (out.kind !== 'graded') throw new Error('expected a grade')
  return out.grade.centre
}

describe('liftLevelTotals', () => {
  it.each([
    ['man, pounds', MAN, 84, 'imperial', lbToKg(1)],
    ['woman, kilograms', WOMAN, 63, 'metric', 1],
  ] as const)(
    'earns each level at its worst total on the corner grade (%s)',
    (_name, profile, mass, units, step) => {
      const bands = liftLevelTotals(profile, DATE, mass, units)!
      expect(bands.map((band) => band.label)).toEqual(GRADE_LEVELS.map((level) => level.label))
      for (const band of bands) {
        const level = GRADE_LEVELS.find((each) => each.label === band.label)!
        if (band.worst !== null) {
          expect(cornerOf(profile, mass, band.worst).grade).toBeGreaterThanOrEqual(level.min)
          expect(cornerOf(profile, mass, band.worst - step).level).not.toBe(band.label)
        }
        if (band.best !== null) expect(cornerOf(profile, mass, band.best).level).toBe(band.label)
      }
    },
  )

  it('names totals in whole pounds', () => {
    for (const band of liftLevelTotals(MAN, DATE, 84, 'imperial')!) {
      if (band.worst === null) continue
      const pounds = band.worst / lbToKg(1)
      expect(pounds).toBeCloseTo(Math.round(pounds), 6)
    }
  })

  it('has no table where the corner has no grade: a mass outside the fitted range, or a birth year too late', () => {
    expect(liftLevelTotals(MAN, DATE, 20, 'metric')).toBeNull()
    expect(liftLevelTotals({ birthYear: 2024, sex: 'male' }, DATE, 80, 'metric')).toBeNull()
  })
})
