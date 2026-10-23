import { describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { curvePoint } from './charts/fixtures'
import {
  FIVE_K_IN_20_MIN_WKG,
  MAN_BORN_1986,
  flatWkg,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
} from './components/fixtures'
import {
  AGE_RANGE_TEXT,
  LEVEL_BANDS,
  NEEDS_EFFORT_TEXT,
  NO_DATE_TEXT,
  NO_STANDARD_TEXT,
  SEX_NOUN,
  athleteOf,
  gradeSentence,
  gradedSexOf,
  headlineGrades,
  outcomeSentence,
  sportGrade,
} from './grades'
import type { AgeProfile, GradeOutcome, SportGrade } from './grades'

/** A date in 2026, the year the fixtures use, and an old one for an effort set long ago. */
const IN_2026 = new Date(2026, 2, 1).getTime()
const IN_2000 = new Date(2000, 5, 1).getTime()

/** The speed of a 5 km run in 20 minutes, in m/s. */
const FIVE_K_SPEED = 5000 / HEADLINE_DURATION_S

/** The grade of a graded outcome; a test that expects a gap fails here instead. */
function gradeOf(outcome: GradeOutcome): SportGrade {
  if (outcome.kind !== 'graded') throw new Error(`Expected a grade, got: ${outcome.reason}`)
  return outcome.grade
}

describe('athleteOf', () => {
  it('reads the age on the date from the year of birth, with the sex', () => {
    expect(athleteOf(MAN_BORN_1986, IN_2026)).toEqual({ age: 40, sex: 'male' })
  })

  it('is null outside the ages the standards cover, 5 to 100', () => {
    expect(athleteOf({ birthYear: 2023, sex: 'male' }, IN_2026)).toBeNull()
    expect(athleteOf({ birthYear: 2021, sex: 'male' }, IN_2026)).toEqual({ age: 5, sex: 'male' })
    expect(athleteOf({ birthYear: 1926, sex: 'female' }, IN_2026)).toEqual({
      age: 100,
      sex: 'female',
    })
    expect(athleteOf({ birthYear: 1925, sex: 'female' }, IN_2026)).toBeNull()
  })
})

describe('sportGrade for a run', () => {
  it('grades a best 20-minute run at the age on the date of that activity', () => {
    const outcome = sportGrade(
      makeResult({ runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')] }),
      'run',
      HEADLINE_DURATION_S,
      MAN_BORN_1986,
    )
    expect(outcome.kind).toBe('graded')
    if (outcome.kind !== 'graded') return
    expect(outcome.age).toBe(40)
    expect(outcome.grade.centre.percent).toBe(67.6)
    expect(outcome.grade.centre.level).toBe('Local')
    expect(outcome.grade.range).toBeNull()
  })

  it('grades each run at the age on its own date, not the newest activity', () => {
    const result = makeResult({
      // A newer run is on file too: dating by the newest activity would give 40, not 14.
      activities: [
        makeActivity({ id: 'run-old', startMs: IN_2000 }),
        makeActivity({ id: 'run-new', startMs: IN_2026 }),
      ],
      runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-old')],
    })
    const outcome = sportGrade(result, 'run', HEADLINE_DURATION_S, MAN_BORN_1986)
    expect(outcome).toMatchObject({ kind: 'graded', age: 14 })
    const grade = gradeOf(outcome)
    expect(grade.centre.percent).toBe(66.6)
    expect(grade.centre.level).toBe('Local')
  })

  it('is a gap saying a best 20-minute effort is needed, with no effort at that length', () => {
    expect(
      sportGrade(makeResult({ runCurve: [] }), 'run', HEADLINE_DURATION_S, MAN_BORN_1986),
    ).toEqual({ kind: 'gap', reason: NEEDS_EFFORT_TEXT })
  })

  it('is a gap when the activity behind the effort is not among the activities', () => {
    const result = makeResult({
      runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'gone')],
    })
    expect(sportGrade(result, 'run', HEADLINE_DURATION_S, MAN_BORN_1986)).toEqual({
      kind: 'gap',
      reason: NO_DATE_TEXT,
    })
  })

  it('is a gap saying the ages covered when the age on the date is outside 5 to 100', () => {
    const result = makeResult({
      runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
    })
    const profile: AgeProfile = { birthYear: 1900, sex: 'male' }
    expect(sportGrade(result, 'run', HEADLINE_DURATION_S, profile)).toEqual({
      kind: 'gap',
      reason: AGE_RANGE_TEXT,
    })
  })

  it('is a gap saying there is no standard for a run covering less than a mile', () => {
    // 60 s at 8 m/s covers 480 m.
    const result = makeResult({ runCurve: [curvePoint(60, flatWkg(8), 'run-1')] })
    expect(sportGrade(result, 'run', 60, MAN_BORN_1986)).toEqual({
      kind: 'gap',
      reason: NO_STANDARD_TEXT,
    })
  })

  it('is a gap saying a best effort is needed for an effort value that is not a number', () => {
    const result = makeResult({
      runCurve: [curvePoint(HEADLINE_DURATION_S, Number.NaN, 'run-1')],
    })
    expect(sportGrade(result, 'run', HEADLINE_DURATION_S, MAN_BORN_1986)).toEqual({
      kind: 'gap',
      reason: NEEDS_EFFORT_TEXT,
    })
  })

  it('words the two gaps differently', () => {
    expect(NEEDS_EFFORT_TEXT).toBe('Age grade needs a best 20 min effort.')
    expect(NO_STANDARD_TEXT).not.toBe(NEEDS_EFFORT_TEXT)
  })
})

describe('sportGrade for a ride', () => {
  const rideEquivalent = makeEquivalence({
    durationS: HEADLINE_DURATION_S,
    runSpeed: interval(3.9, FIVE_K_SPEED, 4.4),
  })

  it('grades the equivalent with the range from its low to its high end', () => {
    const result = makeResult({
      activities: [makeActivity({ id: 'ride-1', sport: 'ride', startMs: IN_2026 })],
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      equivalents: [rideEquivalent],
    })
    const grade = gradeOf(sportGrade(result, 'ride', HEADLINE_DURATION_S, MAN_BORN_1986))
    expect(grade.centre.percent).toBe(67.6)
    expect(grade.centre.level).toBe('Local')
    expect(grade.range?.low.percent).toBe(63)
    expect(grade.range?.high.percent).toBe(71.5)
    expect(grade.range?.high.level).toBe('Regional')
  })

  it('grades a ride at the age on the date of the ride that set its best at that duration', () => {
    const result = makeResult({
      // A newer ride is on file too: dating by the newest activity would give 40, not 14.
      activities: [
        makeActivity({ id: 'ride-old', sport: 'ride', startMs: IN_2000 }),
        makeActivity({ id: 'ride-new', sport: 'ride', startMs: IN_2026 }),
      ],
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-old')],
      equivalents: [rideEquivalent],
    })
    const outcome = sportGrade(result, 'ride', HEADLINE_DURATION_S, MAN_BORN_1986)
    expect(outcome).toMatchObject({ kind: 'graded', age: 14 })
    const grade = gradeOf(outcome)
    expect(grade.centre.percent).toBe(66.6)
    expect(grade.range?.low.percent).toBe(62.2)
    expect(grade.range?.high.percent).toBe(70.8)
  })

  it('is a gap when there is a best ride at that duration but no equivalent for it', () => {
    const result = makeResult({
      activities: [makeActivity({ id: 'ride-1', sport: 'ride', startMs: IN_2026 })],
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      equivalents: [makeEquivalence({ durationS: 600 })],
    })
    expect(sportGrade(result, 'ride', HEADLINE_DURATION_S, MAN_BORN_1986)).toEqual({
      kind: 'gap',
      reason: NO_STANDARD_TEXT,
    })
  })

  it('is a gap when an end of the range has no grade', () => {
    const result = makeResult({
      activities: [makeActivity({ id: 'ride-1', sport: 'ride', startMs: IN_2026 })],
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      equivalents: [makeEquivalence({ runSpeed: interval(0, FIVE_K_SPEED, 4.4) })],
    })
    expect(sportGrade(result, 'ride', HEADLINE_DURATION_S, MAN_BORN_1986)).toEqual({
      kind: 'gap',
      reason: NO_STANDARD_TEXT,
    })
  })
})

describe('headline grades and the sex they are for', () => {
  const graded = makeResult({
    activities: [
      makeActivity({ id: 'run-1', sport: 'run', startMs: IN_2026 }),
      makeActivity({ id: 'ride-1', sport: 'ride', startMs: IN_2026 }),
    ],
    runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')],
  })

  it('grades each sport at the headline duration', () => {
    const headline = headlineGrades(graded, MAN_BORN_1986)
    expect(headline.run.kind).toBe('graded')
    expect(headline.ride).toEqual({ kind: 'gap', reason: NEEDS_EFFORT_TEXT })
  })

  it('names the sex when a grade shows, and nothing when none does or the profile is missing', () => {
    expect(gradedSexOf(headlineGrades(graded, MAN_BORN_1986), MAN_BORN_1986)).toBe('male')
    const none = makeResult({ runCurve: [] })
    expect(gradedSexOf(headlineGrades(none, MAN_BORN_1986), MAN_BORN_1986)).toBeNull()
    expect(gradedSexOf(null, null)).toBeNull()
  })
})

describe('grade sentences', () => {
  it('states a run grade as an estimate, with its level', () => {
    const grade = gradeOf(
      sportGrade(
        makeResult({ runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')] }),
        'run',
        HEADLINE_DURATION_S,
        MAN_BORN_1986,
      ),
    )
    expect(gradeSentence(grade)).toBe('Estimated age grade 67.6% · Local')
  })

  it('adds a ride’s range in brackets', () => {
    const grade = gradeOf(
      sportGrade(
        makeResult({
          activities: [makeActivity({ id: 'ride-old', sport: 'ride', startMs: IN_2000 })],
          rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-old')],
          equivalents: [makeEquivalence({ runSpeed: interval(3.9, FIVE_K_SPEED, 4.4) })],
        }),
        'ride',
        HEADLINE_DURATION_S,
        MAN_BORN_1986,
      ),
    )
    expect(gradeSentence(grade)).toBe('Estimated age grade 66.6% · Local (62.2–70.8%)')
  })

  it('gives no sentence for a gap', () => {
    const gap: GradeOutcome = { kind: 'gap', reason: NEEDS_EFFORT_TEXT }
    expect(outcomeSentence(gap)).toBeNull()
  })
})

describe('level bands and sex', () => {
  it('lists the bands lowest first, named as the UI writes them, with their lower bounds', () => {
    expect(LEVEL_BANDS).toEqual([
      { name: 'Recreational', min: 0 },
      { name: 'Local', min: 0.6 },
      { name: 'Regional', min: 0.7 },
      { name: 'National', min: 0.8 },
      { name: 'World', min: 0.9 },
    ])
  })

  it('names each sex as a noun for the sentence', () => {
    expect(SEX_NOUN).toEqual({ female: 'woman', male: 'man' })
  })
})
