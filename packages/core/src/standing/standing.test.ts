import { describe, expect, it } from 'vitest'
import { analyze } from '../pipeline'
import type { AnalysisResult } from '../pipeline'
import { thresholdRunSpeed } from '../digest/equivalents'
import { CYCLING_WORLD_CLASS_HOUR_WKG } from '../digest/rideAnchor'
import { ageAndSexAt, gradeAtSpeed } from '../grade'
import type { AgeProfile } from '../grade'
import { metabolicToFlatSpeed, metabolicToRidePower } from '../metabolic'
import { PRIORS } from '../constants'
import { sampleDataset } from '../synthetic'
import { HOUR_S } from '../threshold/constants'
import { sportStanding } from './standing'
import { balanceLead } from './lead'

const { athlete, activities } = sampleDataset()
const result = analyze(activities, { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg })
const LAST_YEAR = new Date(Math.max(...result.activities.map((a) => a.startMs))).getFullYear()
const MAN: AgeProfile = { birthYear: LAST_YEAR - 35, sex: 'male' }
const CONTEXT = { massKg: athlete.massKg, units: 'metric' } as const

/** The day of the effort behind each sport's threshold. */
function strongestDay(r: AnalysisResult, sport: 'run' | 'ride') {
  const estimate = sport === 'run' ? r.runThreshold! : r.rideThreshold!
  return r.activities.find((a) => a.id === estimate.efforts.strongest.activityId)!
}

describe('sportStanding', () => {
  const standing = sportStanding(result, MAN, CONTEXT)

  it('grades a run threshold as an hour at the age on the day of its strongest effort', () => {
    const grade = standing.grades.run
    expect(grade.kind).toBe('graded')
    if (grade.kind !== 'graded') return
    const who = ageAndSexAt(MAN, strongestDay(result, 'run'))!
    expect(grade.age).toBe(who.age)
    const speed = metabolicToFlatSpeed(result.runThreshold!.value)
    expect(grade.grade.centre.grade).toBe(gradeAtSpeed(speed, HOUR_S, who)!.grade)
    // The run carries its threshold's range.
    expect(grade.grade.range!.low.grade).toBeLessThanOrEqual(grade.grade.centre.grade)
    expect(grade.grade.range!.high.grade).toBeGreaterThanOrEqual(grade.grade.centre.grade)
  })

  it('gives the run a 5th to 95th range from its threshold’s 10th and 90th, as the ride’s is', () => {
    // A threshold whose 10th and 90th sit 1.2816 sd out on the log scale of energy has a 5th and 95th 1.645 sd out.
    const [value, sd] = [result.runThreshold!.value, 0.04]
    const wide = {
      ...result,
      runThreshold: {
        ...result.runThreshold!,
        low: value * Math.exp(-1.2816 * sd),
        high: value * Math.exp(1.2816 * sd),
      },
    }
    const grade = sportStanding(wide, MAN).grades.run
    if (grade.kind !== 'graded' || grade.grade.range === null)
      throw new Error('graded with a range')
    const who = ageAndSexAt(MAN, strongestDay(wide, 'run'))!
    const at = (z: number) =>
      gradeAtSpeed(metabolicToFlatSpeed(value * Math.exp(z * sd)), HOUR_S, who)!
    expect(grade.grade.range.low.grade).toBeCloseTo(at(-1.645).grade, 9)
    expect(grade.grade.range.high.grade).toBeCloseTo(at(1.645).grade, 9)
    // Not the 10th and 90th it was built from.
    expect(grade.grade.range.high.grade).toBeGreaterThan(at(1.2816).grade)
  })

  it('takes each sport’s age on the day of its own strongest effort', () => {
    // Re-date the two strongest efforts to days in different years, so a grade that took the other sport's day, or a day of its
    // own that is not the strongest effort's, comes out at the wrong age.
    const [runDay, rideDay] = [Date.UTC(2021, 5, 15, 12), Date.UTC(2024, 5, 15, 12)]
    const [runId, rideId] = [
      result.runThreshold!.efforts.strongest.activityId,
      result.rideThreshold!.efforts.strongest.activityId,
    ]
    expect(runId).not.toBe(rideId)
    const dated = {
      ...result,
      activities: result.activities.map((activity) => {
        if (activity.id === runId)
          return { ...activity, startMs: runDay, localDayShift: 0 as const }
        if (activity.id === rideId)
          return { ...activity, startMs: rideDay, localDayShift: 0 as const }
        // Every other activity sits in a third year, so no other day can stand in for the strongest one.
        return { ...activity, startMs: Date.UTC(2018, 0, 10, 12), localDayShift: 0 as const }
      }),
    }
    const born = { birthYear: 1990, sex: 'male' } as const
    const spread = sportStanding(dated, born)
    const [run, ride] = [spread.grades.run, spread.grades.ride]
    if (run.kind !== 'graded' || ride.kind !== 'graded') throw new Error('the sample grades both')
    expect([run.age, ride.age]).toEqual([31, 34])
    const runSpeed = metabolicToFlatSpeed(result.runThreshold!.value)
    expect(run.grade.centre.grade).toBe(
      gradeAtSpeed(runSpeed, HOUR_S, { age: 31, sex: 'male' })!.grade,
    )
    expect(run.grade.centre.grade).not.toBe(
      gradeAtSpeed(runSpeed, HOUR_S, { age: 34, sex: 'male' })!.grade,
    )
    const rideSpeed = result.rideThresholdRunSpeed!.p50
    expect(ride.grade.centre.grade).toBe(
      gradeAtSpeed(rideSpeed, HOUR_S, { age: 34, sex: 'male' })!.grade,
    )
    expect(ride.grade.centre.grade).not.toBe(
      gradeAtSpeed(rideSpeed, HOUR_S, { age: 31, sex: 'male' })!.grade,
    )
  })

  it('grades the ride through the anchored running equivalent of its threshold', () => {
    expect(standing.rideAsRun).toEqual(result.rideThresholdRunSpeed)
    expect(standing.rideAsRun).toEqual(thresholdRunSpeed(result.rideThreshold, undefined))
    const ride = standing.grades.ride
    expect(['graded', 'top-of-scale']).toContain(ride.kind)
  })

  it('leads by the two grades, to whole points, with a range the two combine in quadrature', () => {
    const [run, ride] = [standing.grades.run, standing.grades.ride]
    if (run.kind !== 'graded' || ride.kind !== 'graded') throw new Error('the sample grades both')
    expect(standing.lead).toEqual(balanceLead(run.grade, ride.grade))
    const lead = standing.lead!
    expect(lead.low).toBeLessThanOrEqual(lead.centre)
    expect(lead.high).toBeGreaterThanOrEqual(lead.centre)
  })

  it('says why there is no grade', () => {
    expect(sportStanding(result, null).grades.run).toEqual({ kind: 'gap', why: 'no-profile' })
    const bare = { ...result, runThreshold: null }
    expect(sportStanding(bare, MAN).grades.run).toEqual({ kind: 'gap', why: 'no-threshold' })
    expect(sportStanding(bare, MAN).lead).toBeNull()
    const undated = { ...result, activities: [] }
    expect(sportStanding(undated, MAN).grades.run).toEqual({ kind: 'gap', why: 'no-date' })
    expect(sportStanding({ ...result }, { birthYear: 3000, sex: 'male' }).grades.run).toEqual({
      kind: 'gap',
      why: 'age-range',
    })
  })

  it('puts a ride at the cycling world-class hour at the top of the scale', () => {
    const wkg = CYCLING_WORLD_CLASS_HOUR_WKG.male / PRIORS.grossEfficiency.mean
    const top = { ...result.rideThreshold!, value: wkg, low: wkg, high: wkg }
    const strong = {
      ...result,
      rideThreshold: top,
      rideThresholdRunSpeed: thresholdRunSpeed(top, 'male'),
    }
    expect(sportStanding(strong, MAN).grades.ride.kind).toBe('top-of-scale')
  })
})

describe('what the lower sport needs to match the higher', () => {
  it('is the figure the equivalence grades back at the target, named on a 5 W step for a ride', () => {
    // Raise the run until the balance leans toward it, so the ride is the lower sport.
    const fast = { ...result.runThreshold!, value: result.runThreshold!.value * 1.15 }
    const leaning = {
      ...result,
      runThreshold: { ...fast, low: fast.value * 0.97, high: fast.value * 1.03 },
    }
    const standing = sportStanding(leaning, MAN, CONTEXT)
    const need = standing.match.ride
    expect(standing.lead!.lean).toBe('run')
    expect(standing.match.run).toBeNull()
    if (need === null) throw new Error('the ride has a match figure')
    expect(need.centre % 5).toBe(0)
    expect(need.low).toBeLessThanOrEqual(need.centre)
    expect(need.high).toBeGreaterThanOrEqual(need.centre)
    const now = metabolicToRidePower(
      leaning.rideThreshold!.value,
      CONTEXT.massKg,
      PRIORS.grossEfficiency.mean,
    )
    expect(need.now).toBeCloseTo(now, 9)
    expect(need.centre).toBeGreaterThan(now)
    // The watts grade at least the run's whole percent.
    const run = standing.grades.run
    if (run.kind !== 'graded') throw new Error('graded')
    const atNeed = {
      ...leaning.rideThreshold!,
      value: need.centre / (CONTEXT.massKg * PRIORS.grossEfficiency.mean),
      low: need.centre / (CONTEXT.massKg * PRIORS.grossEfficiency.mean),
      high: need.centre / (CONTEXT.massKg * PRIORS.grossEfficiency.mean),
    }
    const equal = sportStanding(
      {
        ...leaning,
        rideThreshold: atNeed,
        rideThresholdRunSpeed: thresholdRunSpeed(atNeed, undefined),
      },
      MAN,
    )
    const ride = equal.grades.ride
    if (ride.kind !== 'graded') throw new Error('graded')
    expect(Math.floor(ride.grade.centre.grade * 100)).toBeGreaterThanOrEqual(
      Math.floor(run.grade.centre.grade * 100),
    )
  })

  it('is absent without a context, for an even lead, and for the higher sport', () => {
    expect(sportStanding(result, MAN).match).toEqual({ run: null, ride: null })
  })
})
