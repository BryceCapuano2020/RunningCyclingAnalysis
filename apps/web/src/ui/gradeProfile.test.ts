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
    expect(profile.ride.map((point) => point.durationS)).toEqual([...PROFILE_DURATIONS_S])
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

const WITHIN = 'elsewhere the range of the gap reaches zero'

describe('profileFinding', () => {
  it('says no duration separates the sports when every gap is within the ride’s range', () => {
    const profile = profileOf([
      [3, 0.62, 0.6],
      [5, 0.58, 0.6],
      [10, 0.6, 0.6],
      [60, 0.61, 0.6],
    ])
    expect(profileFinding(profile)).toBe(
      'At every duration from 3 to 60 min the range of the gap reaches zero.',
    )
  })

  it('counts a run at the edge of the range as within it, by whole percents', () => {
    // The ride's range is 57 to 63%: a run at 63.9% shows as 63%, so it does not separate them.
    const edge = profileOf([
      [5, 0.639, 0.6],
      [10, 0.639, 0.6],
    ])
    expect(profileFinding(edge)).toContain('the range of the gap reaches zero')
    const past = profileOf([
      [5, 0.64, 0.6],
      [10, 0.64, 0.6],
    ])
    expect(profileFinding(past)).toContain('Your running grades about')
  })

  it('says how many points higher the sport is, steadily, when it is outside the range at every duration', () => {
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

  it('says the gap widens or narrows toward longer efforts when it changes by 4 points or more', () => {
    const widens = profileOf([
      [10, 0.68, 0.64],
      [30, 0.72, 0.64],
      [60, 0.74, 0.64],
    ])
    expect(profileFinding(widens)).toBe(
      'Your running grades about 8 points higher than your cycling at every duration from 10 to 60 min, and the gap widens toward longer efforts.',
    )
    const narrows = profileOf([
      [10, 0.74, 0.64],
      [30, 0.72, 0.64],
      [60, 0.68, 0.64],
    ])
    expect(profileFinding(narrows)).toBe(
      'Your running grades about 8 points higher than your cycling at every duration from 10 to 60 min, and the gap narrows toward longer efforts.',
    )
  })

  it('calls a change of 3 points steady, takes the shape from the two ends, and a change of 4 is a shape', () => {
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
    const bump = profileOf([
      [10, 0.7, 0.64],
      [20, 0.8, 0.64],
      [60, 0.7, 0.64],
    ])
    expect(profileFinding(bump)).toContain('by a steady margin')
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
    const profile = profileOf(
      [
        [10, 0.65, 0.64],
        [20, 0.65, 0.64],
      ],
      0.005,
    )
    expect(profileFinding(profile)).toContain('about 1 point higher')
  })

  it('names where the higher sport changes, with nothing else to say when every duration separates them', () => {
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

  it('names only the stretches outside the range, and says the rest are within it', () => {
    const upTo = profileOf([
      [3, 0.7, 0.6],
      [5, 0.7, 0.6],
      [10, 0.6, 0.6],
      [20, 0.6, 0.6],
    ])
    expect(profileFinding(upTo)).toBe(`Your running grades higher up to 5 min; ${WITHIN}.`)
    const from = profileOf([
      [3, 0.6, 0.6],
      [5, 0.6, 0.6],
      [10, 0.6, 0.8],
      [20, 0.6, 0.8],
    ])
    expect(profileFinding(from)).toBe(`Your cycling grades higher from 10 min on; ${WITHIN}.`)
    const one = profileOf([
      [3, 0.6, 0.6],
      [5, 0.8, 0.6],
      [10, 0.6, 0.6],
    ])
    expect(profileFinding(one)).toBe(`Your running grades higher at 5 min; ${WITHIN}.`)
  })

  it('keeps one stretch where the run dips inside the range between durations it is outside, and names the dip', () => {
    // 10, 30 and 60 min are within the range, and 15, 20 and 45 min are outside it: the rounding at the
    // edge of the range must not break the lead into fragments.
    const profile = profileOf([
      [10, 0.62, 0.6],
      [15, 0.7, 0.6],
      [20, 0.7, 0.6],
      [30, 0.62, 0.6],
      [45, 0.7, 0.6],
      [60, 0.6, 0.6],
    ])
    expect(profileFinding(profile)).toBe(
      `Your running grades higher from 15 to 45 min, apart from 30 min; ${WITHIN}.`,
    )
  })

  it('names a change of lead and the durations within range between the two', () => {
    const profile = profileOf([
      [3, 0.6, 0.8],
      [5, 0.6, 0.8],
      [10, 0.6, 0.6],
      [20, 0.8, 0.6],
      [60, 0.8, 0.6],
    ])
    expect(profileFinding(profile)).toBe(
      `Your cycling grades higher up to 5 min, your running from 20 min on; ${WITHIN}.`,
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
