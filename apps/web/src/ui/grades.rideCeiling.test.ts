import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { equivalentRunSpeed } from '@rca/core/digest'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import { gapOfHeadline } from './balanceGap'
import { curvePoint } from './charts/fixtures'
import { flatWkg, makeActivity, makeEquivalence, makeResult } from './components/fixtures'
import {
  TOP_OF_SCALE_SHORT,
  TOP_OF_SCALE_TEXT,
  gapRecordText,
  headlineGrades,
  isTopOfScale,
  notGradedText,
  rideGradeFromSpeeds,
  sportGrade,
} from './grades'
import type { AgeProfile, GradeOutcome } from './grades'
import { missingText } from './pages/balanceMissing'
import { rideHoldInputs, rideLeftOut } from './rideLeftOut'
import { heldPick } from './resultHold'
import { POWER_IMPLAUSIBLE_TEXT } from './analysis/powerCheckCopy'
import { gradeCeiling } from '@rca/core/grade'

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
 * The page's result for a ride of this W/kg at this mass: the equivalent is built as the analysis builds it,
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

describe('a ride at the top of the age tables', () => {
  it('reads as the top of the scale for a young man at 6.3 W/kg and above, not as a fault', () => {
    for (const wkg of [6.3, 7, 9]) {
      const outcome = rideOf(wkg, 75, athlete(25, 'male'))
      expect(outcome).toEqual({ kind: 'top-of-scale', age: 25 })
      expect(isTopOfScale(outcome)).toBe(true)
    }
  })

  it('reads as the top of the scale for an older woman at 5 W/kg, where the running age factors read it above 100%', () => {
    expect(rideOf(5, 62, athlete(65, 'female'))).toEqual({ kind: 'top-of-scale', age: 65 })
  })

  it('says so plainly, with no prompt to check the setup', () => {
    expect(TOP_OF_SCALE_TEXT).toContain('top of what the age tables cover')
    expect(TOP_OF_SCALE_TEXT).toContain('100%')
    expect(TOP_OF_SCALE_TEXT).not.toMatch(
      /calibration|weight|e-bike|check|implausible|because|caused/i,
    )
    expect(notGradedText(rideOf(7, 75, athlete(25, 'male')))).toBe(TOP_OF_SCALE_TEXT)
    expect(notGradedText(rideOf(3.5, 75, athlete(35, 'male')))).toBeNull()
  })

  it('still grades a typical rider, and never above the ceiling at either end of its range', () => {
    expect(rideOf(3.5, 75, athlete(35, 'male')).kind).toBe('graded')
    // A strong young man at 5.2 W/kg: the centre is under the ceiling, the 95th percentile is over it.
    const strong = rideOf(5.2, 75, athlete(25, 'male'))
    if (strong.kind !== 'graded') throw new Error(`Expected a grade, got: ${strong.kind}`)
    const ceiling = gradeCeiling(HEADLINE_DURATION_S, strong.age, 'male')!
    expect(strong.grade.centre.grade).toBeLessThan(ceiling)
    expect(strong.grade.range?.high.grade).toBe(ceiling)
    expect(strong.grade.range?.high.grade).toBeLessThanOrEqual(1)
  })

  it('is one reading for the cards and the trend: ends held at the ceiling, the top flagged', () => {
    const speeds = equivalentRunSpeed(9 * 75, 75, null)
    const read = rideGradeFromSpeeds(speeds, HEADLINE_DURATION_S, { age: 25, sex: 'male' })
    expect(read?.top).toBe(true)
    const ceiling = gradeCeiling(HEADLINE_DURATION_S, 25, 'male')!
    expect(read?.grade.centre.grade).toBe(ceiling)
    expect(read?.grade.range?.high.grade).toBe(ceiling)
    const typical = rideGradeFromSpeeds(
      equivalentRunSpeed(3.5 * 75, 75, null),
      HEADLINE_DURATION_S,
      { age: 25, sex: 'male' },
    )
    expect(typical?.top).toBe(false)
  })

  it('is short on a record row, and at the top for a length too short for any standard to bound', () => {
    expect(gapRecordText('ride', rideOf(7, 75, athlete(25, 'male')))).toBe(TOP_OF_SCALE_SHORT)
    // A ride equivalent of 9.5 m/s over 3 min covers a mile and is faster than any runner has run.
    const fast = makeResult({
      activities: [makeActivity({ id: 'ride-1', sport: 'ride', startMs: IN_2026 })],
      rideCurve: [curvePoint(180, 900, 'ride-1')],
      equivalents: [makeEquivalence({ durationS: 180, runSpeed: { p05: 9, p50: 9.5, p95: 10 } })],
    })
    expect(isTopOfScale(sportGrade(fast, 'ride', 180, athlete(25, 'male')))).toBe(true)
    // An equivalent under a mile has no standard at all, which is a different thing and says so.
    const slow = makeResult({
      activities: [makeActivity({ id: 'ride-1', sport: 'ride', startMs: IN_2026 })],
      rideCurve: [curvePoint(180, 200, 'ride-1')],
      equivalents: [makeEquivalence({ durationS: 180, runSpeed: { p05: 3, p50: 4, p95: 5 } })],
    })
    expect(sportGrade(slow, 'ride', 180, athlete(25, 'male')).kind).toBe('gap')
  })
})

describe('the balance leaves a ride at the top of the scale out', () => {
  const profile = athlete(25, 'male')

  it('has no grade gap, so the page does not state a points lean', () => {
    const grades = headlineGrades(pageResult(7, 75), profile)
    expect(grades.run.kind).toBe('graded')
    expect(isTopOfScale(grades.ride)).toBe(true)
    expect(gapOfHeadline(grades)).toBeNull()
  })

  it('leaves the headline comparison out too, so the energy view cannot carry the ride in', () => {
    const top = pageResult(7, 75)
    const grades = headlineGrades(top, profile)
    const held = heldPick(top, rideHoldInputs(grades.ride, top))
    expect(held.pick).toBeNull()
    // No fault to name: the ride is out of the comparison, not held for a reason about the evidence.
    expect(held.hold).toBeNull()
    const typical = pageResult(3.5, 75)
    const ordinary = headlineGrades(typical, athlete(35, 'male'))
    expect(heldPick(typical, rideHoldInputs(ordinary.ride, typical)).pick).toEqual(
      heldPick(typical).pick,
    )
    expect(heldPick(typical, rideHoldInputs(null, typical)).pick).toEqual(heldPick(typical).pick)
  })

  it('says the ride is at the top of the scale, not that it lacks hard efforts', () => {
    const result = pageResult(7, 75)
    const levels = { run: null, ride: null }
    const left = rideLeftOut(headlineGrades(result, profile).ride, result)
    expect(left).toBe('top-of-scale')
    const held = missingText(result, result.activities, BALANCE_PERIOD, levels, 0, {
      rideLeftOut: left,
    })
    expect(held.detail).toBe(TOP_OF_SCALE_TEXT)
    expect(missingText(result, result.activities, BALANCE_PERIOD, levels).detail).not.toBe(
      TOP_OF_SCALE_TEXT,
    )
  })

  it('names set-aside power, with what to check, only when the rides were set aside and left no grade', () => {
    const setAside = makeResult({
      activities: [
        makeActivity({ id: 'run-1', sport: 'run' }),
        makeActivity({ id: 'ride-1', sport: 'ride', powerCheck: 'set-aside' }),
      ],
    })
    const gap: GradeOutcome = { kind: 'gap', reason: 'x' }
    expect(rideLeftOut(gap, setAside)).toBe('implausible-power')
    expect(rideLeftOut(gap, makeResult())).toBeNull()
    const graded = headlineGrades(pageResult(3.5, 75), athlete(35, 'male')).ride
    expect(rideLeftOut(graded, setAside)).toBeNull()
    // A ride left in the period means the gap has another reason, which the page says as it does for any gap.
    const mixed = makeResult({
      activities: [
        makeActivity({ id: 'run-1', sport: 'run' }),
        makeActivity({ id: 'ride-1', sport: 'ride', powerCheck: 'set-aside' }),
        makeActivity({ id: 'ride-2', sport: 'ride' }),
      ],
    })
    expect(rideLeftOut(gap, mixed)).toBeNull()
    // A ride too short for the headline is no candidate, so it does not stop the set-aside one being named.
    const shortRide = makeResult({
      activities: [
        makeActivity({ id: 'ride-1', sport: 'ride', powerCheck: 'set-aside' }),
        makeActivity({ id: 'ride-2', sport: 'ride', durationS: 600 }),
      ],
    })
    expect(rideLeftOut(gap, shortRide)).toBe('implausible-power')
    const held = missingText(
      setAside,
      setAside.activities,
      BALANCE_PERIOD,
      { run: null, ride: null },
      0,
      { rideLeftOut: 'implausible-power' },
    )
    expect(held.detail).toBe(POWER_IMPLAUSIBLE_TEXT)
    expect(POWER_IMPLAUSIBLE_TEXT).toMatch(/power meter calibration.*weight setting.*e-bike/)
  })
})
