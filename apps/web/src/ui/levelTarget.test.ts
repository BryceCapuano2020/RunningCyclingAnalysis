import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { equivalentRunSpeed } from '@rca/core/digest'
import { ageGradeForEffort } from '@rca/core/grade'
import type { AnalysisResult } from '@rca/core/pipeline'
import { AnalysisSession } from '@rca/core/session'
import { gapOfHeadline } from './balanceGap'
import { curvePoint } from './charts/fixtures'
import { flatWkg, makeActivity, makeEquivalence, makeResult } from './components/fixtures'
import { headlineGrades, sportGrade, type AgeProfile, type GradeOutcome } from './grades'
import { levelTargetText, levelledNative, nativeAtGrade } from './levelTarget'
import { wholeGrade } from './gradeFormat'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from './sampleAthlete'

/** A 37-year-old man at 75 kg, with the heart-rate cross-check of the fixture result. */
const MASS_KG = 75
const PROFILE: AgeProfile = { birthYear: 1988, sex: 'male' }
const ATHLETE = { age: 37, sex: 'male', massKg: MASS_KG, hr: makeResult().hr } as const
/** An activity dated in 2025, when this athlete is 37. */
const IN_2025 = new Date(2025, 5, 1).getTime()

/** A graded outcome at a given grade, for a sport at the age the test names. */
function graded(grade: number, age = 37): GradeOutcome {
  return { kind: 'graded', age, grade: { centre: { grade, level: 'Local' }, range: null } }
}

/**
 * The grade the page gives a ride whose best effort at the headline duration is these watts: its
 * equivalent is built as the analysis builds it, and the grade is read by sportGrade.
 */
function pageRideGrade(watts: number, result: AnalysisResult, profile: AgeProfile): number {
  const ride = result.activities.find((activity) => activity.sport === 'ride')
  if (ride === undefined) throw new Error('The result has no ride to date the effort by')
  const equivalent = makeEquivalence({
    durationS: HEADLINE_DURATION_S,
    ridePowerW: watts,
    runSpeed: equivalentRunSpeed(watts, MASS_KG, result.hr),
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

  it('gives the ride watts that the page grades back to the target, within half a point', () => {
    const watts = nativeAtGrade('ride', 0.67, HEADLINE_DURATION_S, ATHLETE)!
    expect(watts).toBeGreaterThan(0)
    expect(Math.abs(pageRideGrade(watts, RIDE_RESULT, PROFILE) - 0.67)).toBeLessThanOrEqual(0.005)
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
  const base = { result, grades, sex: 'male' as const, massKg: MASS_KG, units: 'metric' as const }

  it('says what a ride would need to grade level with the run, in watts rounded to 5, with the ride now', () => {
    const line = levelTargetText({ ...base, lean: 'run' })
    expect(line).toMatch(
      /^To grade level with your running at 20 min, your best ride would need about \d+ W \(now 230 W\)\.$/,
    )
    const watts = Number(/about (\d+) W/.exec(line ?? '')?.[1])
    expect(watts % 5).toBe(0)
    expect(watts).toBeGreaterThan(230)
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
    const result = new AnalysisSession().loadSample(SAMPLE_SETTINGS).result
    if (result === null) throw new Error('The sample has no result')
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
      }),
    ).toBe(
      'To grade level with your running at 20 min, your best ride would need about 270 W (now 246 W).',
    )
  })

  it('has watts that the page grades back to the target through the sample heart-rate weights', () => {
    const result = new AnalysisSession().loadSample(SAMPLE_SETTINGS).result
    if (result === null) throw new Error('The sample has no result')
    const athlete = { age: 37, sex: 'male' as const, massKg: SAMPLE_SETTINGS.massKg, hr: result.hr }
    const watts = nativeAtGrade('ride', 0.64, HEADLINE_DURATION_S, athlete)!
    expect(Math.abs(pageRideGrade(watts, result, SAMPLE_PROFILE) - 0.64)).toBeLessThanOrEqual(0.005)
  })
})

describe('the levelled target, rounded toward the side that levels', () => {
  const sampleRide = () => {
    const result = new AnalysisSession().loadSample(SAMPLE_SETTINGS).result
    if (result === null) throw new Error('The sample has no result')
    return result
  }

  it('reaches every whole grade from 50 to 80 for the sample athlete, both sports, as the page grades it', () => {
    const result = sampleRide()
    const athlete = {
      age: 37,
      sex: 'male' as const,
      massKg: SAMPLE_SETTINGS.massKg,
      hr: result.hr,
    }
    for (let whole = 50; whole <= 80; whole++) {
      const grade = whole / 100
      const watts = nativeAtGrade('ride', grade, HEADLINE_DURATION_S, athlete)
      if (watts === null) throw new Error(`No ride reaches ${whole}%`)
      const rideGrade = pageRideGrade(
        levelledNative('ride', watts, 'metric'),
        result,
        SAMPLE_PROFILE,
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
    const result = sampleRide()
    const athlete = {
      age: 37,
      sex: 'male' as const,
      massKg: SAMPLE_SETTINGS.massKg,
      hr: result.hr,
    }
    const levelled = levelledNative(
      'ride',
      nativeAtGrade('ride', 0.64, HEADLINE_DURATION_S, athlete)!,
      'metric',
    )
    const rideId = result.activities.find((activity) => activity.sport === 'ride')!.id
    const grades = headlineGrades(result, SAMPLE_PROFILE)
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
      })
    expect(at(levelled)).toBeNull()
    expect(at(levelled - 1)).toContain(`(now ${levelled - 1} W).`)
  })
})
