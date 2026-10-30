import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { equivalentRunSpeed } from '@rca/core/digest'
import { gradeCeiling } from '@rca/core/grade'
import type { AnalysisResult } from '@rca/core/pipeline'
import { gapOfHeadline } from './balanceGap'
import { curvePoint } from './charts/fixtures'
import { flatWkg, makeActivity, makeEquivalence, makeResult } from './components/fixtures'
import {
  IMPLAUSIBLE_RIDE_SHORT,
  IMPLAUSIBLE_RIDE_TEXT,
  gapRecordText,
  headlineGrades,
  isImplausibleRide,
  sportGrade,
  unlessRideImplausible,
} from './grades'
import type { AgeProfile, GradeOutcome } from './grades'
import type { Period } from '@rca/core/period'
import { missingText } from './pages/balanceMissing'

const BALANCE_PERIOD: Period = {
  choice: 'all',
  startMs: new Date(2026, 0, 1).getTime(),
  endMs: new Date(2026, 5, 1).getTime(),
  days: null,
  fellBack: false,
}

/** A date in 2026, the year the fixtures use. */
const IN_2026 = new Date(2026, 2, 1).getTime()

/** A synthetic athlete of this age on the fixtures' dates, and this sex. */
const athlete = (age: number, sex: AgeProfile['sex']): AgeProfile => ({
  birthYear: 2026 - age,
  sex,
})

/**
 * The page's grade for a ride of this W/kg at this mass: the equivalent is built as the analysis builds it,
 * beside a run of 4 m/s, so the headline grades both sports.
 */
function pageResult(wkg: number, massKg: number): AnalysisResult {
  const watts = wkg * massKg
  const base = makeResult({
    activities: [
      makeActivity({ id: 'run-1', sport: 'run', startMs: IN_2026 }),
      makeActivity({ id: 'ride-1', sport: 'ride', startMs: IN_2026 }),
    ],
    runCurve: [curvePoint(HEADLINE_DURATION_S, flatWkg(4), 'run-1')],
    rideCurve: [curvePoint(HEADLINE_DURATION_S, watts, 'ride-1')],
  })
  return {
    ...base,
    equivalents: [
      makeEquivalence({
        durationS: HEADLINE_DURATION_S,
        ridePowerW: watts,
        runSpeed: equivalentRunSpeed(watts, massKg, base.hr),
      }),
    ],
  }
}

const rideOf = (wkg: number, massKg: number, profile: AgeProfile): GradeOutcome =>
  sportGrade(pageResult(wkg, massKg), 'ride', HEADLINE_DURATION_S, profile)

describe('a ride at the top of the power range', () => {
  it('is flagged as implausible input for a young man at 6.3 W/kg and above', () => {
    for (const wkg of [6.3, 7, 9]) {
      const outcome = rideOf(wkg, 75, athlete(25, 'male'))
      expect(outcome).toEqual({ kind: 'gap', reason: IMPLAUSIBLE_RIDE_TEXT })
      expect(isImplausibleRide(outcome)).toBe(true)
    }
  })

  it('is flagged for an older woman at 5 W/kg, where the running age factors read it far above 100%', () => {
    expect(rideOf(5, 62, athlete(65, 'female'))).toEqual({
      kind: 'gap',
      reason: IMPLAUSIBLE_RIDE_TEXT,
    })
  })

  it('names the likely checks as possibilities and no cause', () => {
    expect(IMPLAUSIBLE_RIDE_TEXT).toContain('implausible')
    expect(IMPLAUSIBLE_RIDE_TEXT).toMatch(/power meter calibration.*weight setting.*e-bike/)
    expect(IMPLAUSIBLE_RIDE_TEXT).not.toMatch(/because|caused/)
  })

  it('still grades a typical rider, and never above the ceiling at either end of its range', () => {
    const typical = rideOf(3.5, 75, athlete(35, 'male'))
    expect(typical.kind).toBe('graded')
    // A strong young man at 5.2 W/kg: the centre is under the ceiling, the 95th percentile is over it.
    const strong = rideOf(5.2, 75, athlete(25, 'male'))
    if (strong.kind !== 'graded') throw new Error(`Expected a grade, got: ${strong.reason}`)
    const ceiling = gradeCeiling(HEADLINE_DURATION_S, strong.age, 'male')!
    expect(strong.grade.centre.grade).toBeLessThan(ceiling)
    expect(strong.grade.range?.high.grade).toBe(ceiling)
    expect(strong.grade.range?.high.grade).toBeLessThanOrEqual(1)
  })

  it('has a ceiling at or under 100% that is lower for an older woman than for a young man', () => {
    const young = gradeCeiling(HEADLINE_DURATION_S, 25, 'male')!
    const older = gradeCeiling(HEADLINE_DURATION_S, 65, 'female')!
    expect(young).toBeLessThanOrEqual(1)
    expect(older).toBeLessThanOrEqual(1)
    expect(young).toBeGreaterThan(0.9)
  })

  it('is a short line on a record row, and the same flag on a length too short for any standard', () => {
    const flagged = rideOf(7, 75, athlete(25, 'male'))
    expect(gapRecordText('ride', flagged)).toBe(IMPLAUSIBLE_RIDE_SHORT)
    // A ride equivalent of 9.5 m/s over 3 min covers a mile and is faster than any runner has run.
    const fast = makeResult({
      activities: [makeActivity({ id: 'ride-1', sport: 'ride', startMs: IN_2026 })],
      rideCurve: [curvePoint(180, 900, 'ride-1')],
      equivalents: [makeEquivalence({ durationS: 180, runSpeed: { p05: 9, p50: 9.5, p95: 10 } })],
    })
    expect(isImplausibleRide(sportGrade(fast, 'ride', 180, athlete(25, 'male')))).toBe(true)
  })
})

describe('the balance leaves a flagged ride out', () => {
  const profile = athlete(25, 'male')

  it('has no grade gap, so the page does not state a points lean', () => {
    const grades = headlineGrades(pageResult(7, 75), profile)
    expect(grades.run.kind).toBe('graded')
    expect(isImplausibleRide(grades.ride)).toBe(true)
    expect(gapOfHeadline(grades)).toBeNull()
  })

  it('holds the headline comparison too, so the energy view cannot carry the ride in', () => {
    const grades = headlineGrades(pageResult(7, 75), profile)
    const pick = { point: makeResult().comparison.prior[0]!, calibrated: false }
    expect(unlessRideImplausible(pick, grades.ride)).toBeNull()
    const ordinary = headlineGrades(pageResult(3.5, 75), athlete(35, 'male'))
    expect(unlessRideImplausible(pick, ordinary.ride)).toBe(pick)
    expect(unlessRideImplausible(pick, null)).toBe(pick)
  })

  it('says the ride is the reason, not a lack of hard efforts', () => {
    const result = pageResult(7, 75)
    const library = result.activities
    const held = missingText(result, library, BALANCE_PERIOD, { run: null, ride: null }, true)
    expect(held.detail).toBe(IMPLAUSIBLE_RIDE_TEXT)
    expect(missingText(result, library, BALANCE_PERIOD, { run: null, ride: null }).detail).not.toBe(
      IMPLAUSIBLE_RIDE_TEXT,
    )
  })
})
