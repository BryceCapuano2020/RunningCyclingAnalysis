import { beforeAll, describe, expect, it } from 'vitest'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { combine, digestActivity, fitnessTrend } from '@rca/core/digest'
import type { TrendPoint } from '@rca/core/digest'
import { ageGradeForEffort } from '@rca/core/grade'
import { flatSpeedToMetabolic, metabolicToFlatSpeed } from '@rca/core/metabolic'
import { sampleDataset } from '@rca/core/synthetic'
import type { AthleteSettings, Sport } from '@rca/core/types'
import { headlineGrades } from '../grades'
import type { AgeProfile } from '../grades'
import { wholeGrade } from '../gradeFormat'
import { gradeWeeks } from './gradeTrend'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const PROFILE: AgeProfile = { birthYear: 1989, sex: 'male' }
const DEC_29_2024 = Date.UTC(2024, 11, 29, 23, 59, 59, 999)
const JAN_12_2025 = Date.UTC(2025, 0, 12, 23, 59, 59, 999)

/** The latest week of a trend that has a value for the sport. */
function latestWeek<T extends { run: number | null; ride: number | null }>(
  weeks: T[],
  sport: Sport,
) {
  return weeks.findLast((week) => week[sport] !== null)
}

describe('gradeWeeks against the cards', () => {
  // One activity is the whole period, so the card and the trend see the same effort.
  const periodOf = (sport: Sport) => {
    const digests = sampleDataset().activities.map((activity) => digestActivity(activity))
    const digest = digests.find(
      (candidate) =>
        candidate.sport === sport &&
        candidate.curve.some(
          (point) => point.durationS === HEADLINE_DURATION_S && Number.isFinite(point.value),
        ),
    )
    if (digest === undefined) throw new Error(`The sample has no ${sport} with a 20-minute effort`)
    const analysis = combine([digest], SETTINGS)
    const trend = fitnessTrend([digest], SETTINGS, {
      bikeModel: analysis.bikeModel,
      equivalence: { hr: analysis.hr },
    })
    return { analysis, trend }
  }

  let run: ReturnType<typeof periodOf>
  let ride: ReturnType<typeof periodOf>
  beforeAll(() => {
    run = periodOf('run')
    ride = periodOf('ride')
  })

  it('grades the latest week of a one-run period as the card does, to the whole percent', () => {
    const headline = headlineGrades(run.analysis, PROFILE).run
    if (headline.kind !== 'graded') throw new Error('the card has no run grade')
    const week = latestWeek(gradeWeeks(run.trend, PROFILE), 'run')
    expect(week?.run).not.toBeNull()
    expect(wholeGrade(week?.run ?? Number.NaN)).toBe(wholeGrade(headline.grade.centre.grade))
  })

  it('grades the latest week of a one-ride period as the card does, with its model range', () => {
    const headline = headlineGrades(ride.analysis, PROFILE).ride
    if (headline.kind !== 'graded' || headline.grade.range === null) {
      throw new Error('the card has no ride grade with a range')
    }
    const week = latestWeek(gradeWeeks(ride.trend, PROFILE), 'ride')
    expect(week?.ride).not.toBeNull()
    expect(wholeGrade(week?.ride ?? Number.NaN)).toBe(wholeGrade(headline.grade.centre.grade))
    expect(wholeGrade(week?.rideLow ?? Number.NaN)).toBe(wholeGrade(headline.grade.range.low.grade))
    expect(wholeGrade(week?.rideHigh ?? Number.NaN)).toBe(
      wholeGrade(headline.grade.range.high.grade),
    )
  })

  it('grades the latest week of the whole mixed sample as the card does, for both sports', () => {
    // A window longer than the sample holds every activity, so the last week is the card's period.
    const digests = sampleDataset().activities.map((activity) => digestActivity(activity))
    const analysis = combine(digests, SETTINGS)
    const trend = fitnessTrend(digests, SETTINGS, {
      windowDays: 400,
      bikeModel: analysis.bikeModel,
      equivalence: { hr: analysis.hr },
    })
    const headline = headlineGrades(analysis, PROFILE)
    const weeks = gradeWeeks(trend, PROFILE)
    if (headline.run.kind !== 'graded' || headline.ride.kind !== 'graded') {
      throw new Error('the sample has no grade for each sport')
    }
    const runWeek = latestWeek(weeks, 'run')
    const rideWeek = latestWeek(weeks, 'ride')
    expect(wholeGrade(runWeek?.run ?? Number.NaN)).toBe(wholeGrade(headline.run.grade.centre.grade))
    expect(wholeGrade(rideWeek?.ride ?? Number.NaN)).toBe(
      wholeGrade(headline.ride.grade.centre.grade),
    )
    expect(wholeGrade(rideWeek?.rideLow ?? Number.NaN)).toBe(
      wholeGrade(headline.ride.grade.range?.low.grade ?? Number.NaN),
    )
  })

  it('grades a week at the age on the day of its best effort, not on the Sunday', () => {
    // The best run was set on 29 December 2024, when the athlete was 35; the week ends on 12 January.
    const point: TrendPoint = {
      endMs: JAN_12_2025,
      runWkg: flatSpeedToMetabolic(4.2),
      rideWkg: null,
      runCount: 1,
      rideCount: 0,
      runAtMs: DEC_29_2024,
      rideAtMs: null,
      rideRunSpeed: null,
    }
    const [week] = gradeWeeks([point], PROFILE)
    const speed = metabolicToFlatSpeed(flatSpeedToMetabolic(4.2))
    expect(week?.run).toBe(ageGradeForEffort(speed, HEADLINE_DURATION_S, 35, 'male'))
    expect(week?.run).not.toBe(ageGradeForEffort(speed, HEADLINE_DURATION_S, 36, 'male'))
  })

  it('gives a week with no value no grade, and keeps its counts', () => {
    const [empty] = gradeWeeks(
      [
        {
          endMs: JAN_12_2025,
          runWkg: null,
          rideWkg: null,
          runCount: 0,
          rideCount: 0,
          runAtMs: null,
          rideAtMs: null,
          rideRunSpeed: null,
        },
      ],
      PROFILE,
    )
    expect(empty).toEqual({
      endMs: JAN_12_2025,
      run: null,
      ride: null,
      rideLow: null,
      rideHigh: null,
      runCount: 0,
      rideCount: 0,
    })
  })
})
