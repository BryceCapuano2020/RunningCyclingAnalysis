import { describe, expect, it } from 'vitest'
import {
  EQUIVALENCE_DURATIONS_S,
  HEADLINE_DURATION_S,
  PROFILE_DURATIONS_S,
} from '@rca/core/constants'
import { analyze, equivalentRunSpeed } from '@rca/core/pipeline'
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
import {
  gradeProfile,
  profileDurations,
  profileEquivalents,
  profileFinding,
  profileLeans,
  profileSeparated,
} from './gradeProfile'
import type { GradeProfile } from './gradeProfile'
import { headlineGrades, sportGrade } from './grades'
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
    const profile = gradeProfile(result, MAN_BORN_1986, MASS_KG, result.hr)
    expect(profile.run.map((point) => point.durationS)).toEqual([...PROFILE_DURATIONS_S])
    // The ride's 3 and 4 min equivalents (9.5 and 7.5 m/s) are faster than the running record for those
    // lengths, so they are flagged as implausible and left out.
    expect(profile.ride.map((point) => point.durationS)).toEqual(
      PROFILE_DURATIONS_S.filter((durationS) => durationS > 240),
    )
  })

  it('gives a run a point and a ride its range', () => {
    const result = makeResult({ activities, runCurve, rideCurve, equivalents })
    const profile = gradeProfile(result, MAN_BORN_1986, MASS_KG, result.hr)
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
    const profile = gradeProfile(result, MAN_BORN_1986, MASS_KG, result.hr)
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
    const profile = gradeProfile(result, MAN_BORN_1986, MASS_KG, result.hr)
    expect(profile.run.map((point) => point.durationS)).toEqual([20 * MIN])
    expect(profile.ride.map((point) => point.durationS)).not.toContain(3 * MIN)
  })

  it('has no points for a sport with no curve', () => {
    const result = makeResult({ activities, runCurve, rideCurve: [], equivalents })
    expect(gradeProfile(result, MAN_BORN_1986, MASS_KG, result.hr).ride).toEqual([])
  })
})

describe('the durations a combine leaves out', () => {
  const { activities } = sampleDataset()
  const result = analyze(activities, { massKg: MASS_KG, bikeMassKg: 9 })
  const beyond = (durationS: number) => !EQUIVALENCE_DURATIONS_S.includes(durationS)

  it('prices an equivalent at each longer or shorter duration the ride curve has a best at', () => {
    const extras = profileEquivalents(result, MASS_KG, result.hr)
    const ridden = PROFILE_DURATIONS_S.filter(beyond).filter((durationS) =>
      result.rideCurve.some((p) => p.durationS === durationS && Number.isFinite(p.value)),
    )
    expect(ridden.length).toBeGreaterThan(0)
    expect(extras.map((e) => e.durationS)).toEqual(ridden)
  })

  it('prices them as a combine does: the same draws, the result’s heart-rate check, the mass', () => {
    for (const extra of profileEquivalents(result, MASS_KG, result.hr)) {
      expect(extra.runSpeed).toEqual(equivalentRunSpeed(extra.ridePowerW, MASS_KG, result.hr))
    }
  })

  it('prices them under the calibration given, the one the result’s own equivalents use, not the period’s check', () => {
    // The library says riding costs this athlete 30% more than the priors assume; the result's own check is silent.
    const library = { kappa: 1.3, lnKappaSe: 0.04 }
    const extras = profileEquivalents(result, MASS_KG, library)
    expect(extras.length).toBeGreaterThan(0)
    for (const extra of extras) {
      expect(extra.runSpeed).toEqual(equivalentRunSpeed(extra.ridePowerW, MASS_KG, library))
    }
    const alone = profileEquivalents(result, MASS_KG, null)
    expect(extras.map((e) => e.runSpeed.p50)).not.toEqual(alone.map((e) => e.runSpeed.p50))
  })

  it('leaves the result’s own equivalents as they were, and prices none a combine already holds', () => {
    const before = structuredClone(result.equivalents)
    gradeProfile(result, MAN_BORN_1986, MASS_KG, result.hr)
    expect(result.equivalents).toEqual(before)
    const held = result.equivalents.map((e) => e.durationS)
    expect(
      profileEquivalents(result, MASS_KG, result.hr).some((e) => held.includes(e.durationS)),
    ).toBe(false)
  })

  it('draws a ride’s grade at those durations, graded as one the combine held would be', () => {
    const profile = gradeProfile(result, MAN_BORN_1986, MASS_KG, result.hr)
    // A 4 min equivalent runs under a mile, which has no standard, so the first graded one is read.
    const extra = profileEquivalents(result, MASS_KG, result.hr).find((e) =>
      profile.ride.some((p) => p.durationS === e.durationS),
    )!
    const priced = { ...result, equivalents: [...result.equivalents, extra] }
    const expected = sportGrade(priced, 'ride', extra.durationS, MAN_BORN_1986)
    expect(expected.kind).toBe('graded')
    const point = profile.ride.find((p) => p.durationS === extra.durationS)
    expect(point?.grade).toEqual(expected.kind === 'graded' ? expected.grade : null)
    expect(profile.ride.some((p) => beyond(p.durationS))).toBe(true)
  })

  it('prices them at the mass given, so the same watts are worth a slower run for a heavier athlete', () => {
    const light = profileEquivalents(result, 60, result.hr)[0]!
    const heavy = profileEquivalents(result, 90, result.hr)[0]!
    expect(heavy.runSpeed.p50).toBeLessThan(light.runSpeed.p50)
  })

  it('prices nothing when the ride curve has no best beyond the combine’s durations', () => {
    expect(profileEquivalents({ ...result, rideCurve: [] }, MASS_KG, result.hr)).toEqual([])
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
    const profile = gradeProfile(sample, MAN_BORN_1986, MASS_KG, sample.hr)
    const at20 = profileLeans(profile).find((lean) => lean.durationS === HEADLINE_DURATION_S)
    expect(gap).not.toBeNull()
    expect(at20?.lean).toBe(gap?.lean)
    expect(at20?.gap).toBe(gap?.centre)
  })

  it('takes the ride’s grade at 20 min from the same equivalence the headline grades', () => {
    const grades = headlineGrades(sample, MAN_BORN_1986)
    const profile = gradeProfile(sample, MAN_BORN_1986, MASS_KG, sample.hr)
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

describe('profileFinding', () => {
  /** A run well outside the ride's range, and a ride well outside the run's. */
  const RUN_AHEAD = [0.7, 0.6] as const
  const RIDE_AHEAD = [0.6, 0.7] as const
  /** Within the ride's range. */
  const ALIKE = [0.61, 0.6] as const

  const rows = (...cells: (readonly [number, readonly [number, number]])[]): Row[] =>
    cells.map(([minutes, [run, ride]]) => [minutes, run, ride])

  it('says the sports grade alike when every gap is within the ride’s range', () => {
    const profile = profileOf(rows([3, ALIKE], [5, ALIKE], [10, ALIKE], [60, ALIKE]))
    expect(profileFinding(profile)).toBe('Running and cycling grade alike')
  })

  it('counts a run at the edge of the range as within it, by whole percents', () => {
    // The ride's range is 57 to 63%: a run at 63.9% shows as 63%, so it does not separate them.
    const edge = profileOf([
      [5, 0.639, 0.6],
      [10, 0.639, 0.6],
    ])
    expect(profileFinding(edge)).toBe('Running and cycling grade alike')
    const past = profileOf([
      [5, 0.64, 0.6],
      [10, 0.64, 0.6],
    ])
    expect(profileFinding(past)).toBe('Running grades higher at every length')
  })

  it('says one sport grades higher at every length, with no figure, when it is outside the range at every duration', () => {
    const profile = profileOf(rows([10, RUN_AHEAD], [20, RUN_AHEAD], [90, RUN_AHEAD]))
    expect(profileFinding(profile)).toBe('Running grades higher at every length')
  })

  it('names cycling when it grades higher throughout', () => {
    const profile = profileOf(rows([10, RIDE_AHEAD], [20, RIDE_AHEAD], [90, RIDE_AHEAD]))
    expect(profileFinding(profile)).toBe('Cycling grades higher at every length')
  })

  it('names the durations where a sport is clearly ahead, from its first to its last', () => {
    const profile = profileOf(
      rows(
        [3, ALIKE],
        [5, ALIKE],
        [10, RUN_AHEAD],
        [15, RUN_AHEAD],
        [20, RUN_AHEAD],
        [30, ALIKE],
        [60, ALIKE],
      ),
    )
    expect(profileFinding(profile)).toBe('Running grades higher at 10 to 20 min')
  })

  it('names an hour effort in minutes, as the records list does', () => {
    const profile = profileOf(rows([10, ALIKE], [30, RUN_AHEAD], [60, RUN_AHEAD]))
    expect(profileFinding(profile)).toBe('Running grades higher at 30 to 60 min')
  })

  it('says nothing of a single-duration exception inside a lead: the lead is one stretch', () => {
    // 30 min is within the range between durations where the run is outside it: that is noise, not a break.
    const profile = profileOf(
      rows(
        [10, ALIKE],
        [15, RUN_AHEAD],
        [20, RUN_AHEAD],
        [30, ALIKE],
        [45, RUN_AHEAD],
        [60, ALIKE],
      ),
    )
    expect(profileFinding(profile)).toBe('Running grades higher at 15 to 45 min')
  })

  it('says nothing of a single-duration lead by the other sport, which is noise', () => {
    const profile = profileOf(
      rows([3, RUN_AHEAD], [5, RUN_AHEAD], [10, RIDE_AHEAD], [20, RUN_AHEAD], [30, RUN_AHEAD]),
    )
    // The ride's one lead at 10 min is not named; the run's lead is said to cover most lengths, not every one.
    expect(profileFinding(profile)).toBe('Running grades higher at most lengths')
  })

  it('says the sports grade alike at most lengths when the only leads are at single durations', () => {
    const profile = profileOf(
      rows([3, ALIKE], [5, RUN_AHEAD], [10, ALIKE], [20, ALIKE], [30, RIDE_AHEAD]),
    )
    expect(profileFinding(profile)).toBe('Running and cycling grade alike at most lengths')
  })

  it('says most lengths where a lead spans every duration but for a dip inside it', () => {
    const profile = profileOf(rows([5, RUN_AHEAD], [10, RUN_AHEAD], [20, ALIKE], [30, RUN_AHEAD]))
    expect(profileFinding(profile)).toBe('Running grades higher at most lengths')
  })

  it('names two stretches where the lead changes hands, each at two durations or more', () => {
    const profile = profileOf(
      rows(
        [3, RIDE_AHEAD],
        [5, RIDE_AHEAD],
        [7, RIDE_AHEAD],
        [10, RUN_AHEAD],
        [20, RUN_AHEAD],
        [60, RUN_AHEAD],
      ),
    )
    expect(profileFinding(profile)).toBe(
      'Cycling grades higher at 3 to 7 min, running at 10 to 60 min',
    )
  })

  it('names the sport that leads first by duration, with the other after it', () => {
    const profile = profileOf(
      rows([3, RUN_AHEAD], [5, RUN_AHEAD], [10, ALIKE], [20, RIDE_AHEAD], [60, RIDE_AHEAD]),
    )
    expect(profileFinding(profile)).toBe(
      'Running grades higher at 3 to 5 min, cycling at 20 to 60 min',
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

  it('is a clause with no figure to read, no semicolon and no "apart from"', () => {
    const profile = profileOf(
      rows(
        [10, ALIKE],
        [15, RUN_AHEAD],
        [20, RUN_AHEAD],
        [30, ALIKE],
        [45, RUN_AHEAD],
        [60, ALIKE],
      ),
    )
    const text = profileFinding(profile) ?? ''
    expect(text).not.toMatch(/;|apart|points|range of the gap|elsewhere/)
  })
})
