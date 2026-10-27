import { describe, expect, it } from 'vitest'
import { PROFILE_DURATIONS_S } from '@rca/core/constants'
import { curvePoint } from './charts/fixtures'
import {
  MAN_BORN_1986,
  flatWkg,
  interval,
  makeActivity,
  makeEquivalence,
  makeResult,
} from './components/fixtures'
import { gradeProfile, profileDurations, profileFinding } from './gradeProfile'
import type { GradeProfile } from './gradeProfile'
import type { Grade, SportGrade } from './grades'

const MIN = 60

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
function profileOf(rows: readonly Row[]): GradeProfile {
  const points = (pick: (row: Row) => number | null, make: (fraction: number) => SportGrade) =>
    rows.flatMap((row) => {
      const grade = pick(row)
      return grade === null ? [] : [{ durationS: row[0] * MIN, grade: make(grade) }]
    })
  return { run: points((row) => row[1], runAt), ride: points((row) => row[2], rideAt) }
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
    const profile = gradeProfile(result, MAN_BORN_1986)
    expect(profile.run.map((point) => point.durationS)).toEqual([...PROFILE_DURATIONS_S])
    expect(profile.ride.map((point) => point.durationS)).toEqual([...PROFILE_DURATIONS_S])
  })

  it('gives a run a point and a ride its range', () => {
    const result = makeResult({ activities, runCurve, rideCurve, equivalents })
    const profile = gradeProfile(result, MAN_BORN_1986)
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
    const profile = gradeProfile(result, MAN_BORN_1986)
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
    const profile = gradeProfile(result, MAN_BORN_1986)
    expect(profile.run.map((point) => point.durationS)).toEqual([20 * MIN])
    expect(profile.ride.map((point) => point.durationS)).not.toContain(3 * MIN)
  })

  it('has no points for a sport with no curve', () => {
    const result = makeResult({ activities, runCurve, rideCurve: [], equivalents })
    expect(gradeProfile(result, MAN_BORN_1986).ride).toEqual([])
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

describe('profileFinding', () => {
  it('says the sport that leads at every duration, over the range both are graded at', () => {
    const profile = profileOf([
      [3, 0.8, 0.6],
      [5, 0.8, 0.6],
      [10, 0.8, 0.6],
      [20, 0.8, 0.6],
      [30, 0.8, 0.6],
      [60, 0.8, 0.6],
    ])
    expect(profileFinding(profile)).toBe(
      'Your running grades higher than your cycling at every duration from 3 to 60 min.',
    )
  })

  it('names the whole span in minutes when both sports are graded out to 3 h', () => {
    const profile = profileOf([
      [3, 0.8, 0.6],
      [4, 0.8, 0.6],
      [45, 0.8, 0.6],
      [90, 0.8, 0.6],
      [180, 0.8, 0.6],
    ])
    expect(profileFinding(profile)).toBe(
      'Your running grades higher than your cycling at every duration from 3 to 180 min.',
    )
  })

  it('names cycling when it leads at every duration, over the durations both have', () => {
    const profile = profileOf([
      [5, 0.6, 0.8],
      [10, 0.6, 0.8],
      [20, 0.6, 0.8],
    ])
    expect(profileFinding(profile)).toBe(
      'Your cycling grades higher than your running at every duration from 5 to 20 min.',
    )
  })

  it('says where the lead crosses', () => {
    const profile = profileOf([
      [3, 0.6, 0.8],
      [5, 0.6, 0.8],
      [10, 0.8, 0.6],
      [20, 0.8, 0.6],
      [30, 0.8, 0.6],
      [60, 0.8, 0.6],
    ])
    expect(profileFinding(profile)).toBe(
      'Your cycling grades higher up to 5 min, your running from 10 min on.',
    )
  })

  it('says the sports grade within range of each other when the run is inside the ride range everywhere', () => {
    const profile = profileOf([
      [3, 0.62, 0.6],
      [5, 0.58, 0.6],
      [10, 0.6, 0.6],
    ])
    expect(profileFinding(profile)).toBe(
      'Your running and cycling grade within range of each other at every duration.',
    )
  })

  it('counts a lead only when the run is outside the ride range, in whole percents', () => {
    // The ride's range is 57 to 63%. A run at 63.9% is 63% when shown, so it is not past the range.
    const edge = profileOf([
      [5, 0.639, 0.6],
      [10, 0.639, 0.6],
    ])
    expect(profileFinding(edge)).toContain('within range')
    const past = profileOf([
      [5, 0.64, 0.6],
      [10, 0.64, 0.6],
    ])
    expect(profileFinding(past)).toContain('running grades higher')
  })

  it('names a lead that holds for part of the durations', () => {
    const upTo = profileOf([
      [3, 0.8, 0.6],
      [5, 0.8, 0.6],
      [10, 0.6, 0.6],
      [20, 0.6, 0.6],
    ])
    expect(profileFinding(upTo)).toBe(
      'Your running grades higher than your cycling up to 5 min. The two grade within range of each other at the other durations.',
    )
    const from = profileOf([
      [3, 0.6, 0.6],
      [5, 0.6, 0.6],
      [10, 0.6, 0.8],
      [20, 0.6, 0.8],
    ])
    expect(profileFinding(from)).toBe(
      'Your cycling grades higher than your running from 10 min on. The two grade within range of each other at the other durations.',
    )
  })

  it('does not say a lead runs up to a duration when it starts later', () => {
    const profile = profileOf([
      [3, 0.6, 0.6],
      [5, 0.8, 0.6],
      [10, 0.6, 0.6],
      [20, 0.6, 0.6],
    ])
    expect(profileFinding(profile)).toBe(
      'Your running grades higher than your cycling at 5 min. The two grade within range of each other at the other durations.',
    )
  })

  it('walks through each lead when it changes hands more than once', () => {
    const profile = profileOf([
      [3, 0.8, 0.6],
      [5, 0.8, 0.6],
      [10, 0.6, 0.8],
      [20, 0.6, 0.8],
      [30, 0.8, 0.6],
    ])
    expect(profileFinding(profile)).toBe(
      'Your running grades higher up to 5 min, your cycling from 10 to 20 min, your running from 30 min on.',
    )
  })

  it('is null with fewer than two durations graded in both sports', () => {
    expect(profileFinding(profileOf([[20, 0.7, 0.6]]))).toBeNull()
    expect(
      profileFinding(
        profileOf([
          [3, 0.7, null],
          [5, 0.7, null],
          [20, null, 0.6],
          [30, null, 0.6],
        ]),
      ),
    ).toBeNull()
    expect(profileFinding({ run: [], ride: [] })).toBeNull()
  })
})
