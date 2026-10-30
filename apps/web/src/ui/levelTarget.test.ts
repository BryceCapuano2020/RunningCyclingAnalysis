import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { equivalentRunSpeed } from '@rca/core/digest'
import { ageGradeForEffort } from '@rca/core/grade'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { HrCalibration } from '@rca/core/types'
import { AnalysisSession } from '@rca/core/session'
import { gapOfHeadline } from './balanceGap'
import { curvePoint } from './charts/fixtures'
import { flatWkg, makeActivity, makeEquivalence, makeResult } from './components/fixtures'
import { headlineGrades, sportGrade, type AgeProfile, type GradeOutcome } from './grades'
import {
  levelTarget,
  levelTargetText,
  levelledNative,
  nativeAtGrade,
  nativeRangeAtGrade,
} from './levelTarget'
import { wholeGrade } from './gradeFormat'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from './sampleAthlete'

/** A 37-year-old man at 75 kg, with the heart-rate cross-check of the fixture result. */
const MASS_KG = 75
const PROFILE: AgeProfile = { birthYear: 1988, sex: 'male' }
const ATHLETE = { age: 37, sex: 'male', massKg: MASS_KG, calibration: makeResult().hr } as const
/** A heart-rate calibration that says riding costs this athlete more than the priors assume. */
const CALIBRATION = { kappa: 1.25, lnKappaSe: 0.05 }
/** An activity dated in 2025, when this athlete is 37. */
const IN_2025 = new Date(2025, 5, 1).getTime()

/** The sample athlete's analysis, with the library calibration its equivalents were priced with. */
function loadedSample() {
  const state = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
  if (state.result === null) throw new Error('The sample has no result')
  return { result: state.result, calibration: state.heartRateJudgement.calibration }
}

/** A graded outcome at a given grade, for a sport at the age the test names. */
function graded(grade: number, age = 37): GradeOutcome {
  return { kind: 'graded', age, grade: { centre: { grade, level: 'Local' }, range: null } }
}

/**
 * The grade the page gives a ride whose best effort at the headline duration is these watts: its
 * equivalent is built as the analysis builds it, and the grade is read by sportGrade.
 */
function pageRideGrade(
  watts: number,
  result: AnalysisResult,
  profile: AgeProfile,
  calibration: HrCalibration | null = result.hr,
): number {
  const ride = result.activities.find((activity) => activity.sport === 'ride')
  if (ride === undefined) throw new Error('The result has no ride to date the effort by')
  const equivalent = makeEquivalence({
    durationS: HEADLINE_DURATION_S,
    ridePowerW: watts,
    runSpeed: equivalentRunSpeed(watts, MASS_KG, calibration),
  })
  const page: AnalysisResult = {
    ...result,
    rideCurve: [curvePoint(HEADLINE_DURATION_S, watts, ride.id)],
    equivalents: [equivalent],
  }
  const outcome = sportGrade(page, 'ride', HEADLINE_DURATION_S, profile)
  if (outcome.kind !== 'graded') throw new Error(`Expected a grade, got: ${outcome.reason}`)
  return outcome.grade.centre.grade
}

/** A result with one ride dated in 2025, so the page grades it at the athlete's age of 37. */
const RIDE_RESULT = makeResult({
  activities: [makeActivity({ id: 'ride-1', sport: 'ride', startMs: IN_2025 })],
})

describe('nativeAtGrade', () => {
  it('gives the flat run speed whose age grade is the target, graded back within half a point', () => {
    const speed = nativeAtGrade('run', 0.67, HEADLINE_DURATION_S, ATHLETE)!
    const grade = ageGradeForEffort(speed, HEADLINE_DURATION_S, ATHLETE.age, ATHLETE.sex)!
    expect(Math.abs(grade - 0.67)).toBeLessThanOrEqual(0.005)
  })

  it('prices the ride with the library calibration it is given, so the page grades the watts back to the target', () => {
    const calibrated = { ...ATHLETE, calibration: CALIBRATION }
    const watts = nativeAtGrade('ride', 0.67, HEADLINE_DURATION_S, calibrated)!
    // The grade chart prices the same watts through the same calibration (gradeProfile's profileEquivalents).
    expect(
      Math.abs(pageRideGrade(watts, RIDE_RESULT, PROFILE, CALIBRATION) - 0.67),
    ).toBeLessThanOrEqual(0.005)
    expect(watts).not.toBeCloseTo(nativeAtGrade('ride', 0.67, HEADLINE_DURATION_S, ATHLETE)!, 0)
  })

  it('gives the ride watts that the page grades back to the target, within half a point', () => {
    const watts = nativeAtGrade('ride', 0.67, HEADLINE_DURATION_S, ATHLETE)!
    expect(watts).toBeGreaterThan(0)
    expect(Math.abs(pageRideGrade(watts, RIDE_RESULT, PROFILE) - 0.67)).toBeLessThanOrEqual(0.005)
  })

  it('gives the watts at each end of the ride grade range, so each end grades back to the target within half a point', () => {
    const range = nativeRangeAtGrade('ride', 0.67, HEADLINE_DURATION_S, ATHLETE)!
    // The page's ride range runs from the grade at the 5th percentile speed to the grade at the 95th.
    const gradeAtEnd = (watts: number, end: 'p05' | 'p95') =>
      ageGradeForEffort(
        equivalentRunSpeed(watts, MASS_KG, ATHLETE.calibration)[end],
        HEADLINE_DURATION_S,
        ATHLETE.age,
        ATHLETE.sex,
      )!
    expect(Math.abs(gradeAtEnd(range.low, 'p95') - 0.67)).toBeLessThanOrEqual(0.005)
    expect(Math.abs(gradeAtEnd(range.high, 'p05') - 0.67)).toBeLessThanOrEqual(0.005)
    expect(range.low).toBeLessThan(range.centre)
    expect(range.centre).toBeLessThan(range.high)
  })

  it('needs more watts for a higher grade, and more speed for a higher grade', () => {
    expect(nativeAtGrade('ride', 0.7, HEADLINE_DURATION_S, ATHLETE)!).toBeGreaterThan(
      nativeAtGrade('ride', 0.6, HEADLINE_DURATION_S, ATHLETE)!,
    )
    expect(nativeAtGrade('run', 0.7, HEADLINE_DURATION_S, ATHLETE)!).toBeGreaterThan(
      nativeAtGrade('run', 0.6, HEADLINE_DURATION_S, ATHLETE)!,
    )
  })

  it('is null for a grade no speed the standards cover reaches', () => {
    expect(nativeAtGrade('run', 1000, HEADLINE_DURATION_S, ATHLETE)).toBeNull()
    expect(nativeAtGrade('ride', 1000, HEADLINE_DURATION_S, ATHLETE)).toBeNull()
  })
})

describe('levelTargetText', () => {
  const result = makeResult({
    activities: [
      makeActivity({ id: 'run-1', sport: 'run' }),
      makeActivity({ id: 'ride-1', sport: 'ride' }),
    ],
    // A run of 3.9 m/s for 20 min, and a ride of 230 W, both below the target the grades name.
    runCurve: [curvePoint(HEADLINE_DURATION_S, flatWkg(3.9), 'run-1')],
    rideCurve: [curvePoint(HEADLINE_DURATION_S, 230, 'ride-1')],
  })
  const grades = { run: graded(0.67), ride: graded(0.6) }
  const base = {
    result,
    grades,
    sex: 'male' as const,
    massKg: MASS_KG,
    units: 'metric' as const,
    calibration: result.hr,
  }

  it('says what a ride would need to grade level with the run, in watts rounded to 5, with the ride now', () => {
    const line = levelTargetText({ ...base, lean: 'run' })
    expect(line).toMatch(
      /^To grade level with your running at 20 min, your best ride would need about \d+ W \(roughly \d+ to \d+ W; now 230 W\)\.$/,
    )
    const [, centre, low, high] = /about (\d+) W \(roughly (\d+) to (\d+) W/.exec(line ?? '') ?? []
    expect(Number(centre) % 5).toBe(0)
    expect(Number(low) % 5).toBe(0)
    expect(Number(high) % 5).toBe(0)
    expect(Number(low)).toBeLessThanOrEqual(Number(centre))
    expect(Number(centre)).toBeLessThanOrEqual(Number(high))
    expect(Number(centre)).toBeGreaterThan(230)
  })

  it('says what a run would need to grade level with the ride, as a flat pace rounded to 5 s', () => {
    const line = levelTargetText({
      ...base,
      lean: 'ride',
      grades: { run: graded(0.6), ride: graded(0.67) },
    })
    expect(line).toMatch(
      /^To grade level with your cycling at 20 min, your best run would need a flat pace of about \d+:\d\d \/km \(now \d+:\d\d \/km\)\.$/,
    )
    const seconds = Number(/about \d+:(\d\d) \/km/.exec(line ?? '')?.[1])
    expect(seconds % 5).toBe(0)
  })

  it("compares a ride held at an earlier weight with the target at today's weight", () => {
    // 300 W at 100 kg is the power-to-weight of 240 W at 80 kg, which is what the target is worked out at.
    const heavier = makeResult({
      activities: [
        makeActivity({ id: 'run-1', sport: 'run' }),
        makeActivity({ id: 'ride-1', sport: 'ride', massKg: 100 }),
      ],
      runCurve: result.runCurve,
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 300, 'ride-1')],
    })
    const line = levelTargetText({ ...base, result: heavier, massKg: 80, lean: 'run' })
    expect(line).toMatch(/now 300 W, 240 W at today’s weight\)\.$/)
  })

  it('says nothing of weight when the lower sport is a run, whose pace has no mass, even with dated masses', () => {
    // The run was recorded on a day the dated mass was 70 kg; today's is 75 kg. A pace is the same either way.
    const dated = makeResult({
      activities: [
        makeActivity({ id: 'run-1', sport: 'run', massKg: 70 }),
        makeActivity({ id: 'ride-1', sport: 'ride', massKg: 70 }),
      ],
      runCurve: result.runCurve,
      rideCurve: result.rideCurve,
    })
    const line = levelTargetText({
      ...base,
      result: dated,
      lean: 'ride',
      grades: { run: graded(0.6), ride: graded(0.67) },
    })
    expect(line).toMatch(
      /your best run would need a flat pace of about \d+:\d\d \/km \(now \d+:\d\d \/km\)\.$/,
    )
    expect(line).not.toContain('today’s weight')
  })

  it('names no line when the balance is even', () => {
    expect(levelTargetText({ ...base, lean: 'even' })).toBeNull()
  })

  it('names no line without a grade for the lower sport, as when there is no weight', () => {
    expect(
      levelTargetText({ ...base, lean: 'run', grades: { run: graded(0.67), ride: null } }),
    ).toBeNull()
    const gap = { kind: 'gap' as const, reason: 'No date' }
    expect(
      levelTargetText({ ...base, lean: 'run', grades: { run: graded(0.67), ride: gap } }),
    ).toBeNull()
  })

  it('names no line when the lower sport already reaches the target', () => {
    const level = {
      ...base,
      lean: 'run' as const,
      grades: { run: graded(0.67), ride: graded(0.67) },
    }
    expect(
      levelTargetText({
        ...level,
        result: { ...result, rideCurve: [curvePoint(HEADLINE_DURATION_S, 900, 'ride-1')] },
      }),
    ).toBeNull()
  })
})

describe('levelTargetText on the sample athlete', () => {
  it('names the ride watts that would grade level with the sample run, as the sample shows them', () => {
    const { result, calibration } = loadedSample()
    const grades = headlineGrades(result, SAMPLE_PROFILE)
    const gap = gapOfHeadline(grades)
    expect(gap?.lean).toBe('run')
    expect(
      levelTargetText({
        lean: 'run',
        grades,
        result,
        sex: SAMPLE_PROFILE.sex,
        massKg: SAMPLE_SETTINGS.massKg,
        units: 'metric',
        calibration,
      }),
    ).toBe(
      'To grade level with your running at 20 min, your best ride would need about 270 W (roughly 245 to 295 W; now 243 W).',
    )
  }, 60_000)

  it('has watts that the page grades back to the target through the sample heart-rate weights', () => {
    const { result, calibration } = loadedSample()
    const athlete = { age: 37, sex: 'male' as const, massKg: SAMPLE_SETTINGS.massKg, calibration }
    const watts = nativeAtGrade('ride', 0.64, HEADLINE_DURATION_S, athlete)!
    expect(
      Math.abs(pageRideGrade(watts, result, SAMPLE_PROFILE, calibration) - 0.64),
    ).toBeLessThanOrEqual(0.005)
  }, 60_000)
})

describe('the levelled target, rounded toward the side that levels', () => {
  const sampleRide = loadedSample

  it('reaches every whole grade from 50 to 80 for the sample athlete, both sports, as the page grades it', () => {
    const { result, calibration } = sampleRide()
    const athlete = {
      age: 37,
      sex: 'male' as const,
      massKg: SAMPLE_SETTINGS.massKg,
      calibration,
    }
    for (let whole = 50; whole <= 80; whole++) {
      const grade = whole / 100
      const watts = nativeAtGrade('ride', grade, HEADLINE_DURATION_S, athlete)
      if (watts === null) throw new Error(`No ride reaches ${whole}%`)
      const rideGrade = pageRideGrade(
        levelledNative('ride', watts, 'metric'),
        result,
        SAMPLE_PROFILE,
        calibration,
      )
      expect(wholeGrade(rideGrade), `ride at ${whole}%`).toBeGreaterThanOrEqual(whole)

      const speed = nativeAtGrade('run', grade, HEADLINE_DURATION_S, athlete)
      if (speed === null) throw new Error(`No run reaches ${whole}%`)
      const levelled = levelledNative('run', speed, 'metric')
      const runGrade = ageGradeForEffort(levelled, HEADLINE_DURATION_S, athlete.age, athlete.sex)
      expect(wholeGrade(runGrade ?? 0), `run at ${whole}%`).toBeGreaterThanOrEqual(whole)
    }
  }, 120_000)

  it('names no line when the ride already shows the levelled watts, and one when it shows one watt less', () => {
    const { result, calibration } = sampleRide()
    const athlete = {
      age: 37,
      sex: 'male' as const,
      massKg: SAMPLE_SETTINGS.massKg,
      calibration,
    }
    const grades = headlineGrades(result, SAMPLE_PROFILE)
    // The ride levels with the sample's own run grade, whatever the season has made it.
    const runGrade = grades.run.kind === 'graded' ? grades.run.grade.centre.grade : Number.NaN
    expect(runGrade).not.toBeNaN()
    const levelled = levelledNative(
      'ride',
      nativeAtGrade('ride', wholeGrade(runGrade) / 100, HEADLINE_DURATION_S, athlete)!,
      'metric',
    )
    const rideId = result.activities.find((activity) => activity.sport === 'ride')!.id
    const withRideAt = (watts: number) => ({
      ...result,
      rideCurve: [curvePoint(HEADLINE_DURATION_S, watts, rideId)],
    })
    const at = (watts: number) =>
      levelTargetText({
        lean: 'run',
        grades,
        result: withRideAt(watts),
        sex: SAMPLE_PROFILE.sex,
        massKg: SAMPLE_SETTINGS.massKg,
        units: 'metric',
        calibration,
      })
    expect(at(levelled)).toBeNull()
    expect(at(levelled - 1)).toContain(`; now ${levelled - 1} W).`)
  }, 60_000)
})

describe('levelTarget', () => {
  const result = makeResult({
    activities: [
      makeActivity({ id: 'run-1', sport: 'run' }),
      makeActivity({ id: 'ride-1', sport: 'ride' }),
    ],
    runCurve: [curvePoint(HEADLINE_DURATION_S, flatWkg(3.9), 'run-1')],
    rideCurve: [curvePoint(HEADLINE_DURATION_S, 230, 'ride-1')],
  })
  const base = {
    result,
    grades: { run: graded(0.67), ride: graded(0.6) },
    sex: 'male' as const,
    massKg: MASS_KG,
    units: 'metric' as const,
    calibration: result.hr,
  }

  it('gives the pieces of the sentence the page words, so a drawing can use them and the sentence is unchanged', () => {
    const target = levelTarget({ ...base, lean: 'run' })
    expect(target).toMatchObject({ higher: 'run', lower: 'ride' })
    expect(target?.centre).toMatch(/^\d+ W$/)
    expect(target?.range).toMatch(/^\d+ to \d+ W$/)
    expect(target?.now).toBe('230 W')
    expect(target?.sentence).toBe(levelTargetText({ ...base, lean: 'run' }))
    expect(target?.sentence).toContain(
      `about ${target?.centre} (roughly ${target?.range?.replace(' to ', ' to ')}; now ${target?.now})`,
    )
  })

  it('gives a run as its pace, with no range, since a run’s grade is one recorded effort', () => {
    const slowRun = makeResult({
      ...result,
      runCurve: [curvePoint(HEADLINE_DURATION_S, flatWkg(3.0), 'run-1')],
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 320, 'ride-1')],
    })
    const target = levelTarget({
      ...base,
      result: slowRun,
      lean: 'ride',
      grades: { run: graded(0.5), ride: graded(0.67) },
    })
    expect(target).toMatchObject({ higher: 'ride', lower: 'run', range: null })
    expect(target?.centre).toMatch(/^\d+:\d{2} \/km$/)
  })

  it('is null where the sentence is: an even balance, or a target the page already shows', () => {
    expect(levelTarget({ ...base, lean: 'even' })).toBeNull()
  })
})
