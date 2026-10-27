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

const ESTIMATED = "Cycling's grades are estimated, so a gap this size is within their range."

describe('profileFinding', () => {
  it('says how many points the sport that grades higher is ahead by, at every duration, steadily', () => {
    // A ride's range is 3 points either side, so a run 6 above it is outside that range.
    const profile = profileOf([
      [10, 0.7, 0.64],
      [20, 0.7, 0.64],
      [90, 0.7, 0.64],
    ])
    expect(profileFinding(profile)).toBe(
      'Your running grades about 6 points higher than your cycling at every duration from 10 to 90 min, by a steady margin.',
    )
  })

  it('names cycling when it grades higher throughout', () => {
    const profile = profileOf([
      [5, 0.6, 0.7],
      [10, 0.6, 0.7],
      [20, 0.6, 0.7],
    ])
    expect(profileFinding(profile)).toBe(
      'Your cycling grades about 10 points higher than your running at every duration from 5 to 20 min, by a steady margin.',
    )
  })

  it('says the gap widens toward longer efforts when it grows by 4 points or more', () => {
    const profile = profileOf([
      [10, 0.68, 0.64],
      [30, 0.72, 0.64],
      [60, 0.74, 0.64],
    ])
    expect(profileFinding(profile)).toBe(
      'Your running grades about 8 points higher than your cycling at every duration from 10 to 60 min, and the gap widens toward longer efforts.',
    )
  })

  it('says the gap narrows toward longer efforts when it shrinks by 4 points or more', () => {
    const profile = profileOf([
      [10, 0.74, 0.64],
      [30, 0.72, 0.64],
      [60, 0.68, 0.64],
    ])
    expect(profileFinding(profile)).toBe(
      'Your running grades about 8 points higher than your cycling at every duration from 10 to 60 min, and the gap narrows toward longer efforts.',
    )
  })

  it('calls a change of 3 points steady, and one of 4 a shape', () => {
    const steady = profileOf([
      [10, 0.7, 0.64],
      [60, 0.73, 0.64],
    ])
    expect(profileFinding(steady)).toContain('by a steady margin')
    const widening = profileOf([
      [10, 0.7, 0.64],
      [60, 0.74, 0.64],
    ])
    expect(profileFinding(widening)).toContain('the gap widens')
  })

  it('takes the shape from the shortest and longest shared durations, not the ones between', () => {
    const profile = profileOf([
      [10, 0.7, 0.64],
      [20, 0.8, 0.64],
      [60, 0.7, 0.64],
    ])
    expect(profileFinding(profile)).toContain('by a steady margin')
  })

  it('gives the median of the gaps in whole points, averaging the middle two', () => {
    const odd = profileOf([
      [10, 0.68, 0.64],
      [20, 0.7, 0.64],
      [30, 0.84, 0.64],
    ])
    expect(profileFinding(odd)).toContain('about 6 points')
    const even = profileOf([
      [10, 0.68, 0.64],
      [20, 0.7, 0.64],
    ])
    expect(profileFinding(even)).toContain('about 5 points')
  })

  it('says one point in the singular', () => {
    const profile = profileOf([
      [10, 0.65, 0.64],
      [20, 0.65, 0.64],
    ])
    expect(profileFinding(profile)).toContain('about 1 point higher')
  })

  it('names where the higher sport changes', () => {
    const profile = profileOf([
      [3, 0.6, 0.8],
      [5, 0.6, 0.8],
      [7, 0.6, 0.8],
      [10, 0.8, 0.6],
      [20, 0.8, 0.6],
      [60, 0.8, 0.6],
    ])
    expect(profileFinding(profile)).toBe(
      'Your cycling grades higher up to 7 min, your running from 10 min on.',
    )
  })

  it('walks through more than one change, saying neighbouring durations of a sport together', () => {
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

  it('reads the centres, so a run at the edge of the ride’s range is not a change of lead', () => {
    // Run 64, 63, 64, 55 against a ride of 58, 57, 58, 50 with an 8 point range either side: the run
    // is inside the range at every duration, yet ahead by its centre at each, so the lead never flips.
    const profile: GradeProfile = {
      run: [
        { durationS: 10 * MIN, grade: runAt(0.64) },
        { durationS: 15 * MIN, grade: runAt(0.63) },
        { durationS: 20 * MIN, grade: runAt(0.64) },
        { durationS: 30 * MIN, grade: runAt(0.55) },
      ],
      ride: [
        { durationS: 10 * MIN, grade: rideAt(0.58, 0.08) },
        { durationS: 15 * MIN, grade: rideAt(0.57, 0.08) },
        { durationS: 20 * MIN, grade: rideAt(0.58, 0.08) },
        { durationS: 30 * MIN, grade: rideAt(0.5, 0.08) },
      ],
    }
    expect(profileFinding(profile)).toBe(
      `Your running grades about 6 points higher than your cycling at every duration from 10 to 30 min, by a steady margin. ${ESTIMATED}`,
    )
  })

  it('adds that the estimate’s grades are estimates when the gap is within its range at more than half the durations', () => {
    // Gaps of 2, 2 and 5 against a range of 3 either side: within it at two of three.
    const profile = profileOf([
      [10, 0.66, 0.64],
      [20, 0.66, 0.64],
      [30, 0.69, 0.64],
    ])
    expect(profileFinding(profile)).toBe(
      `Your running grades about 2 points higher than your cycling at every duration from 10 to 30 min, by a steady margin. ${ESTIMATED}`,
    )
  })

  it('leaves the qualifier off at exactly half the durations, and when the gap is outside the range', () => {
    const half = profileOf([
      [10, 0.66, 0.64],
      [20, 0.7, 0.64],
    ])
    expect(profileFinding(half)).not.toContain('estimated')
    const outside = profileOf([
      [10, 0.7, 0.64],
      [20, 0.7, 0.64],
    ])
    expect(profileFinding(outside)).not.toContain('estimated')
  })

  it('adds the qualifier to a change of lead too', () => {
    const profile = profileOf([
      [5, 0.62, 0.64],
      [10, 0.66, 0.64],
      [20, 0.62, 0.64],
    ])
    expect(profileFinding(profile)).toBe(
      `Your cycling grades higher up to 5 min, your running at 10 min, your cycling from 20 min on. ${ESTIMATED}`,
    )
  })

  it('does not say every duration where the two read the same at one', () => {
    const profile = profileOf([
      [10, 0.64, 0.64],
      [20, 0.66, 0.64],
    ])
    expect(profileFinding(profile)).toBe(
      `Your running grades about 1 point higher than your cycling from 10 to 20 min, by a steady margin. ${ESTIMATED}`,
    )
  })

  it('says the sports grade the same when every centre reads the same', () => {
    const profile = profileOf([
      [10, 0.64, 0.64],
      [20, 0.64, 0.64],
    ])
    expect(profileFinding(profile)).toBe(
      'Your running and cycling grade the same at every duration.',
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
