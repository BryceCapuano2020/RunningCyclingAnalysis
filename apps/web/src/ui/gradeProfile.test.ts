import { describe, expect, it } from 'vitest'
import { headlineGrades } from './balanceFixtures'
import {
  EQUIVALENCE_DURATIONS_S,
  HEADLINE_DURATION_S,
  PROFILE_DURATIONS_S,
} from '@rca/core/constants'
import { analyze, profileEquivalents } from '@rca/core/pipeline'
import { sampleDataset } from '@rca/core/synthetic'
import { curvePoint } from './charts/fixtures'
import {
  MAN_BORN_1986,
  flatWkg,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
} from './components/fixtures'
import { gapOfHeadline } from './balanceGap'
import { gradeProfile, profileDurations, profileLeans, profileSeparated } from './gradeProfile'
import type { GradeProfile } from './gradeProfile'
import { sportGrade } from './grades'
import type { Grade, SportGrade } from './grades'

const MIN = 60
const MASS_KG = 75

/** A run's grade: one activity's estimate, so a point with no range. */
function runAt(fraction: number): SportGrade {
  return { centre: { grade: fraction, level: 'Local' }, range: null }
}

/** A ride's grade, with its model range around the centre. */
function rideAt(fraction: number, spread = 0.03): SportGrade {
  const at = (grade: number): Grade => ({ grade, level: 'Local' })
  return {
    centre: at(fraction),
    range: { low: at(fraction - spread), high: at(fraction + spread) },
  }
}

type Row = readonly [minutes: number, run: number | null, ride: number | null]

/** A profile with a run and a ride grade at each of the durations, in minutes. */
function profileOf(rows: readonly Row[], spread = 0.03): GradeProfile {
  const points = (pick: (row: Row) => number | null, make: (fraction: number) => SportGrade) =>
    rows.flatMap((row) => {
      const grade = pick(row)
      return grade === null ? [] : [{ durationS: row[0] * MIN, grade: make(grade) }]
    })
  return {
    run: points((row) => row[1], runAt),
    ride: points(
      (row) => row[2],
      (fraction) => rideAt(fraction, spread),
    ),
  }
}

describe('gradeProfile', () => {
  const startMs = new Date(2026, 2, 1).getTime()
  const activities = [
    makeActivity({ id: 'run-1', sport: 'run', startMs }),
    makeActivity({ id: 'ride-1', sport: 'ride', startMs }),
  ]
  /** Running speeds, m/s, that each duration from 3 min to 3 h covers a mile or more at, at its range's slow end too. */
  const runSpeeds: Record<number, number> = {
    180: 9.5,
    240: 7.5,
    300: 5.8,
    420: 5.5,
    600: 4.9,
    900: 4.8,
    1200: 4.6,
    1800: 4.4,
    2700: 4.3,
    3600: 4.1,
    5400: 3.9,
    7200: 3.8,
    10800: 3.6,
  }
  const speedAt = (durationS: number) => runSpeeds[durationS] ?? 4
  const runCurve = Object.keys(runSpeeds).map((durationS) =>
    curvePoint(Number(durationS), flatWkg(speedAt(Number(durationS))), 'run-1'),
  )
  const rideCurve = PROFILE_DURATIONS_S.map((durationS) => curvePoint(durationS, 300, 'ride-1'))
  const equivalents = PROFILE_DURATIONS_S.map((durationS) =>
    makeEquivalence({
      durationS,
      runSpeed: interval(speedAt(durationS) - 0.2, speedAt(durationS), speedAt(durationS) + 0.2),
    }),
  )

  it('grades each sport at the durations from 3 min to 3 h that it has a best, in order', () => {
    const result = makeResult({ activities, runCurve, rideCurve, equivalents })
    const profile = gradeProfile(result, MAN_BORN_1986, MASS_KG)
    expect(profile.run.map((point) => point.durationS)).toEqual([...PROFILE_DURATIONS_S])
    // The ride's 3 and 4 min equivalents (9.5 and 7.5 m/s) are faster than the running record for those
    // lengths, so they are flagged as implausible and left out.
    expect(profile.ride.map((point) => point.durationS)).toEqual(
      PROFILE_DURATIONS_S.filter((durationS) => durationS > 240),
    )
  })

  it('gives a run a point and a ride its range', () => {
    const result = makeResult({ activities, runCurve, rideCurve, equivalents })
    const profile = gradeProfile(result, MAN_BORN_1986, MASS_KG)
    expect(profile.run.every((point) => point.grade.range === null)).toBe(true)
    expect(profile.ride.every((point) => point.grade.range !== null)).toBe(true)
  })

  it('leaves out a duration with no best, and never invents a point for it', () => {
    const result = makeResult({
      activities,
      runCurve: runCurve.filter((point) => point.durationS !== 600),
      rideCurve,
      equivalents,
    })
    const profile = gradeProfile(result, MAN_BORN_1986, MASS_KG)
    expect(profile.run.map((point) => point.durationS)).not.toContain(10 * MIN)
    expect(profile.ride.map((point) => point.durationS)).toContain(10 * MIN)
  })

  it('leaves out a run under a mile, which has no standard, and a ride with no equivalent', () => {
    const result = makeResult({
      activities,
      // 3 minutes at 4 m/s is 720 m, under a mile.
      runCurve: [curvePoint(180, flatWkg(4), 'run-1'), curvePoint(1200, flatWkg(4.6), 'run-1')],
      rideCurve,
      equivalents: equivalents.filter((equivalence) => equivalence.durationS !== 180),
    })
    const profile = gradeProfile(result, MAN_BORN_1986, MASS_KG)
    expect(profile.run.map((point) => point.durationS)).toEqual([20 * MIN])
    expect(profile.ride.map((point) => point.durationS)).not.toContain(3 * MIN)
  })

  it('has no points for a sport with no curve', () => {
    const result = makeResult({ activities, runCurve, rideCurve: [], equivalents })
    expect(gradeProfile(result, MAN_BORN_1986, MASS_KG).ride).toEqual([])
  })
})

describe('the durations a combine leaves out', () => {
  const { activities } = sampleDataset()
  const result = analyze(activities, { massKg: MASS_KG, bikeMassKg: 9 })
  const beyond = (durationS: number) => !EQUIVALENCE_DURATIONS_S.includes(durationS)

  it('leaves the result’s own equivalents as they were, and prices none a combine already holds', () => {
    const before = structuredClone(result.equivalents)
    gradeProfile(result, MAN_BORN_1986, MASS_KG)
    expect(result.equivalents).toEqual(before)
    const held = result.equivalents.map((e) => e.durationS)
    expect(
      profileEquivalents(result, MASS_KG, 'male').some((e) => held.includes(e.durationS)),
    ).toBe(false)
  })

  it('draws a ride’s grade at those durations, graded as one the combine held would be', () => {
    const profile = gradeProfile(result, MAN_BORN_1986, MASS_KG)
    // A 4 min equivalent runs under a mile, which has no standard, so the first graded one is read.
    const extra = profileEquivalents(result, MASS_KG, 'male').find((e) =>
      profile.ride.some((p) => p.durationS === e.durationS),
    )!
    const priced = { ...result, equivalents: [...result.equivalents, extra] }
    const expected = sportGrade(priced, 'ride', extra.durationS, MAN_BORN_1986)
    expect(expected.kind).toBe('graded')
    const point = profile.ride.find((p) => p.durationS === extra.durationS)
    expect(point?.grade).toEqual(expected.kind === 'graded' ? expected.grade : null)
    expect(profile.ride.some((p) => beyond(p.durationS))).toBe(true)
  })
})

describe('profileDurations', () => {
  it('lists the durations both sports are graded at', () => {
    const profile = profileOf([
      [3, 0.7, null],
      [5, 0.7, 0.6],
      [10, 0.7, 0.6],
      [20, null, 0.6],
    ])
    expect(profileDurations(profile)).toEqual([5 * MIN, 10 * MIN])
  })
})

describe('profileLeans and profileSeparated', () => {
  const sample = analyze(sampleDataset().activities, { massKg: MASS_KG, bikeMassKg: 9 })

  it('reads the lean at 20 min from the grades and the balance rule the headline uses', () => {
    const grades = headlineGrades(sample, MAN_BORN_1986)
    const gap = gapOfHeadline(grades)
    const profile = gradeProfile(sample, MAN_BORN_1986, MASS_KG)
    const at20 = profileLeans(profile).find((lean) => lean.durationS === HEADLINE_DURATION_S)
    expect(gap).not.toBeNull()
    expect(at20?.lean).toBe(gap?.lean)
    expect(at20?.gap).toBe(gap?.centre)
  })

  it('takes the ride’s grade at 20 min from the same equivalence the headline grades', () => {
    const grades = headlineGrades(sample, MAN_BORN_1986)
    const profile = gradeProfile(sample, MAN_BORN_1986, MASS_KG)
    const ride = profile.ride.find((point) => point.durationS === HEADLINE_DURATION_S)
    expect(grades.ride.kind).toBe('graded')
    expect(ride?.grade).toEqual(grades.ride.kind === 'graded' ? grades.ride.grade : null)
  })

  it('says whether any duration is outside the ride’s range, which is when a sport is higher', () => {
    expect(
      profileSeparated(
        profileOf([
          [10, 0.62, 0.6],
          [20, 0.7, 0.6],
        ]),
      ),
    ).toBe(true)
    expect(
      profileSeparated(
        profileOf([
          [10, 0.62, 0.6],
          [20, 0.58, 0.6],
        ]),
      ),
    ).toBe(false)
    expect(profileSeparated({ run: [], ride: [] })).toBe(false)
  })
})
