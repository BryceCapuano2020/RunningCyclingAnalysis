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
  ageAndSexAt,
  distanceGrade,
  gapRecordText,
  gradeParts,
  gradedSexOf,
  headlineGrades,
  listedGradeNotes,
  notGradedText,
  sportGrade,
} from './grades'
import type { AgeProfile, GradeOutcome, SportGrade } from './grades'
import { formatGrade } from './gradeFormat'
import { ageProfileOf, gradeLevelText, heroGradeLine } from './grades'

/** A date in 2026, the year the fixtures use, and an old one for an effort set long ago. */
const IN_2026 = new Date(2026, 2, 1).getTime()
const IN_2000 = new Date(2000, 5, 1).getTime()

/** The speed of a 5 km run in 20 minutes, in m/s. */
const FIVE_K_SPEED = 5000 / HEADLINE_DURATION_S

/** The grade of a graded outcome; a test that expects a gap fails here instead. */
function gradeOf(outcome: GradeOutcome): SportGrade {
  if (outcome.kind !== 'graded') throw new Error(`Expected a grade, got: ${notGradedText(outcome)}`)
  return outcome.grade
}

describe('ageAndSexAt', () => {
  it('reads the age on the date from the year of birth, with the sex', () => {
    expect(ageAndSexAt(MAN_BORN_1986, IN_2026)).toEqual({ age: 40, sex: 'male' })
  })

  it('is null outside the ages the standards cover, 5 to 100', () => {
    expect(ageAndSexAt({ birthYear: 2023, sex: 'male' }, IN_2026)).toBeNull()
    expect(ageAndSexAt({ birthYear: 2021, sex: 'male' }, IN_2026)).toEqual({ age: 5, sex: 'male' })
    expect(ageAndSexAt({ birthYear: 1926, sex: 'female' }, IN_2026)).toEqual({
      age: 100,
      sex: 'female',
    })
    expect(ageAndSexAt({ birthYear: 1925, sex: 'female' }, IN_2026)).toBeNull()
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
    expect(formatGrade(outcome.grade.centre.grade)).toBe('67%')
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
    expect(formatGrade(grade.centre.grade)).toBe('66%')
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
    expect(formatGrade(grade.centre.grade)).toBe('67%')
    expect(grade.centre.level).toBe('Local')
    expect(formatGrade(grade.range?.low.grade ?? 0)).toBe('63%')
    expect(formatGrade(grade.range?.high.grade ?? 0)).toBe('71%')
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
    expect(formatGrade(grade.centre.grade)).toBe('66%')
    expect(formatGrade(grade.range?.low.grade ?? 0)).toBe('62%')
    expect(formatGrade(grade.range?.high.grade ?? 0)).toBe('70%')
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

  it('does not count a ride whose grade is held, when the ride is not on screen', () => {
    const rideOnly = makeResult({
      activities: [makeActivity({ id: 'ride-1', sport: 'ride', startMs: IN_2026 })],
      rideCurve: [curvePoint(HEADLINE_DURATION_S, 400, 'ride-1')],
      equivalents: [makeEquivalence({ runSpeed: interval(3.9, FIVE_K_SPEED, 4.4) })],
    })
    const headline = headlineGrades(rideOnly, MAN_BORN_1986)
    expect(headline.ride.kind).toBe('graded')
    expect(gradedSexOf(headline, MAN_BORN_1986)).toBe('male')
    expect(gradedSexOf(headline, MAN_BORN_1986, false)).toBeNull()
  })
})

describe('grade parts', () => {
  it('reads a run grade as recorded, with its level and whole percent, and no estimate word', () => {
    const grade = gradeOf(
      sportGrade(
        makeResult({ runCurve: [curvePoint(HEADLINE_DURATION_S, FIVE_K_IN_20_MIN_WKG, 'run-1')] }),
        'run',
        HEADLINE_DURATION_S,
        MAN_BORN_1986,
      ),
    )
    expect(gradeParts('run', grade)).toEqual({
      lead: null,
      level: 'Local',
      value: '67%',
      range: null,
    })
  })

  it('names no level when a ride range crosses a band boundary, so the number and range stand alone', () => {
    const grade: SportGrade = {
      centre: { grade: 0.6, level: 'Local' },
      range: {
        low: { grade: 0.55, level: 'Recreational' },
        high: { grade: 0.64, level: 'Local' },
      },
    }
    expect(gradeParts('ride', grade)).toEqual({
      lead: 'Estimated',
      level: null,
      value: '60%',
      range: '55 to 64',
    })
  })

  it('says a ride record is graded through its running equivalent, and a run record is not', () => {
    const ride: SportGrade = {
      centre: { grade: 0.6, level: 'Local' },
      range: {
        low: { grade: 0.55, level: 'Recreational' },
        high: { grade: 0.64, level: 'Local' },
      },
    }
    expect(gradeParts('ride', ride, 'record')).toMatchObject({
      lead: 'Estimated through its running equivalent',
      level: null,
    })
    expect(
      gradeParts('run', { centre: { grade: 0.676, level: 'Local' }, range: null }, 'record').lead,
    ).toBeNull()
  })

  it('splits a ride sentence into its lead, level, whole percent and range', () => {
    const grade: SportGrade = {
      centre: { grade: 0.6, level: 'Local' },
      range: {
        low: { grade: 0.55, level: 'Recreational' },
        high: { grade: 0.64, level: 'Local' },
      },
    }
    expect(gradeParts('ride', grade)).toEqual({
      lead: 'Estimated',
      level: null,
      value: '60%',
      range: '55 to 64',
    })
    expect(gradeParts('ride', grade, 'record').lead).toBe(
      'Estimated through its running equivalent',
    )
  })

  it('has no lead and no range for a run, which is read as recorded', () => {
    const grade: SportGrade = { centre: { grade: 0.676, level: 'Local' }, range: null }
    expect(gradeParts('run', grade)).toEqual({
      lead: null,
      level: 'Local',
      value: '67%',
      range: null,
    })
  })

  it('names one level when the whole range sits in one band', () => {
    const grade: SportGrade = {
      centre: { grade: 0.66, level: 'Local' },
      range: { low: { grade: 0.63, level: 'Local' }, high: { grade: 0.69, level: 'Local' } },
    }
    expect(gradeParts('ride', grade)).toMatchObject({
      lead: 'Estimated',
      level: 'Local',
      value: '66%',
      range: '63 to 69',
    })
  })

  it('reads a ride grade as estimated, with its range in brackets', () => {
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
    // The range runs from 62% (Local) to 70% (Regional), so no level is named.
    expect(gradeParts('ride', grade)).toMatchObject({
      lead: 'Estimated',
      level: null,
      value: '66%',
      range: '62 to 70',
    })
  })

  it('gives a record’s gap as a short line, saying a run has no standard under a mile', () => {
    const gap: GradeOutcome = { kind: 'gap', reason: NO_STANDARD_TEXT }
    expect(gapRecordText('run', gap)).toBe('No age standard under 1 mile')
    expect(gapRecordText('ride', gap)).toBe('No age standard for this duration')
  })

  it('says a list’s lead and no-standard gap once under it, so a row in that list drops both', () => {
    const ride: SportGrade = { centre: { grade: 0.6, level: 'Local' }, range: null }
    const graded: GradeOutcome = { kind: 'graded', age: 40, grade: ride }
    const gap: GradeOutcome = { kind: 'gap', reason: NO_STANDARD_TEXT }
    expect(gradeParts('ride', ride, 'row').lead).toBeNull()
    expect(gradeParts('ride', ride, 'row').level).toBe('Local')
    expect(listedGradeNotes('ride', [graded, null], ['20 min', '60 min'])).toEqual([
      'Estimated through its running equivalent',
    ])
    expect(listedGradeNotes('run', [graded, gap], ['5 km', '1 km'])).toEqual([
      'No age standard under 1 mile, for the 1 km',
    ])
    expect(listedGradeNotes('ride', [gap], ['5 min'])).toEqual(['No age standard for the 5 min'])
  })

  it('names which records have no standard, so the note under a list is never read against the wrong row', () => {
    const graded: GradeOutcome = {
      kind: 'graded',
      age: 40,
      grade: { centre: { grade: 0.8, level: 'Local' }, range: null },
    }
    const gap: GradeOutcome = { kind: 'gap', reason: NO_STANDARD_TEXT }
    expect(listedGradeNotes('ride', [gap, graded, gap], ['3 min', '20 min', '5 min']).at(-1)).toBe(
      'No age standard for the 3 min and 5 min',
    )
  })

  it('names nothing under a list with no graded ride and no no-standard gap', () => {
    expect(listedGradeNotes('run', [], [])).toEqual([])
    expect(listedGradeNotes('ride', [{ kind: 'gap', reason: NO_DATE_TEXT }], ['5 min'])).toEqual([])
    expect(listedGradeNotes('run', [null], ['1 km'])).toEqual([])
  })

  it('keeps the reason of any other gap, and gives no gap for a graded record', () => {
    expect(gapRecordText('run', { kind: 'gap', reason: NO_DATE_TEXT })).toBe(NO_DATE_TEXT)
    const graded: GradeOutcome = {
      kind: 'graded',
      age: 40,
      grade: { centre: { grade: 0.676, level: 'Local' }, range: null },
    }
    expect(gapRecordText('run', graded)).toBeNull()
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

describe('ageProfileOf', () => {
  it('is the profile the grades need once both the year of birth and the sex are known', () => {
    expect(ageProfileOf(1986, 'male')).toEqual({ birthYear: 1986, sex: 'male' })
  })

  it('is null while either the year of birth or the sex is missing', () => {
    expect(ageProfileOf(null, 'male')).toBeNull()
    expect(ageProfileOf(1986, null)).toBeNull()
  })
})

describe('distanceGrade', () => {
  // A man born in 1990, so 34 on 15 June 2024. He runs 5 km in 20 min 50 s that day.
  const profile: AgeProfile = { birthYear: 1990, sex: 'male' }
  const JUNE_2024 = new Date(2024, 5, 15).getTime()

  it('grades a 5 km record at the exact grade for the age on the day it was run', () => {
    expect(distanceGrade(5000, 1250, JUNE_2024, profile)).toEqual({
      kind: 'graded',
      age: 34,
      grade: { centre: { grade: 0.6224, level: 'Local' }, range: null },
    })
  })
})

describe('gradeLevelText', () => {
  const band = (grade: number, level: string) => ({ grade, level })

  it('names the level of a run, which has no range', () => {
    expect(gradeLevelText({ centre: band(0.64, 'Local'), range: null })).toBe('Local')
  })

  it('names the level when the whole range sits in one band, and none when it crosses two', () => {
    const centre = band(0.64, 'Local')
    expect(
      gradeLevelText({ centre, range: { low: band(0.62, 'Local'), high: band(0.68, 'Local') } }),
    ).toBe('Local')
    expect(
      gradeLevelText({
        centre,
        range: { low: band(0.58, 'Recreational'), high: band(0.68, 'Local') },
      }),
    ).toBeNull()
  })
})

describe('heroGradeLine', () => {
  const grade = (level: string, centre: number): SportGrade => ({
    centre: { grade: centre, level },
    range: null,
  })

  it('names the level, the whole percent and the effort it grades, as the share card reads it', () => {
    expect(heroGradeLine(grade('Local', 0.64))).toBe('Local · 64% on best 20 min')
  })

  it('gives a ride whose range crosses a level its number and range alone, as the page does', () => {
    const ride: SportGrade = {
      centre: { grade: 0.61, level: 'Recreational' },
      range: {
        low: { grade: 0.55, level: 'Recreational' },
        high: { grade: 0.67, level: 'Local' },
      },
    }
    expect(heroGradeLine(ride)).toBe('61% (55 to 67) on best 20 min')
  })
})
