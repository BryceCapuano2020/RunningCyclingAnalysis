import { describe, expect, it } from 'vitest'
import type { Measurement } from '../athlete/measurements'
import { HEADLINE_DURATION_S } from '../constants'
import { PeriodCache } from '../periodCache'
import { recordHolders } from '../records'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, AthleteSettings } from '../types'
import { centralWkgFromWatts, combine, equivalentRunSpeed, sportCurves } from './combine'
import { digestActivity } from './digestActivity'
import { fitnessTrend } from './trend'

const samples = sampleDataset().activities.map((activity) => digestActivity(activity))
const baseRide = samples.find((digest) => digest.sport === 'ride')!

/** A ride with measured watts at the headline duration and nothing elsewhere, on a local day. */
function ride(id: string, day: [number, number, number], watts: number): ActivityDigest {
  return {
    ...baseRide,
    id,
    startMs: new Date(day[0], day[1] - 1, day[2], 12).getTime(),
    powerSource: 'measured',
    calibration: null,
    climbSections: [],
    hrBlocks: [],
    curve: baseRide.curve.map((point) =>
      Object.assign({}, point, {
        value: point.durationS === HEADLINE_DURATION_S ? watts : Number.NaN,
        terms: null,
      }),
    ),
  }
}

const mass = (value: number, from: string): Measurement => ({ kind: 'massKg', value, from })
const plain: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const dated: AthleteSettings = {
  ...plain,
  measurements: [mass(90, '2023-01-01'), mass(70, '2024-01-01')],
}

// A heavier, stronger rider in 2023, and a lighter, weaker one in 2025.
const old = ride('old', [2023, 6, 15], 260)
const recent = ride('recent', [2025, 6, 15], 220)
const rides = [old, recent]

/** Two numbers that are close, or both NaN where a duration has no ride. */
function expectClose(actual: number, expected: number, digits: number): void {
  if (Number.isNaN(expected)) expect(actual).toBeNaN()
  else expect(actual).toBeCloseTo(expected, digits)
}

const atHeadline = (curve: { durationS: number }[]) =>
  curve.findIndex((point) => point.durationS === HEADLINE_DURATION_S)

describe('an analysis with dated body mass', () => {
  it('prices each ride at the mass in effect on its date', () => {
    const result = combine(rides, dated)
    const wkg = result.rideMetabolicCurve[atHeadline(result.rideMetabolicCurve)]!
    // 260 W at 90 kg is 2.9 W/kg; 220 W at 70 kg is 3.1 W/kg, so the later ride holds the best W/kg.
    expect(wkg.activityId).toBe('recent')
    expect(wkg.value).toBeCloseTo(centralWkgFromWatts(220, 70), 12)
    // The watts curve is from the same ride, and holds that ride's own watts.
    const watts = result.rideCurve[atHeadline(result.rideCurve)]!
    expect(watts.activityId).toBe('recent')
    expect(watts.value).toBeCloseTo(220, 9)
  })

  it("with today's mass for every ride, would have chosen the heavier ride", () => {
    const result = combine(rides, plain)
    const wkg = result.rideMetabolicCurve[atHeadline(result.rideMetabolicCurve)]!
    expect(wkg.activityId).toBe('old')
    expect(wkg.value).toBeCloseTo(centralWkgFromWatts(260, 70), 12)
  })

  it('is the same analysis when every dated mass is the profile mass', () => {
    const flat: AthleteSettings = { ...plain, measurements: [mass(70, '2020-01-01')] }
    const withDates = combine(rides, flat)
    const without = combine(rides, plain)
    const [dated, undated] = [withDates.rideCurve, without.rideCurve]
    expect(dated.map((p) => p.activityId)).toEqual(undated.map((p) => p.activityId))
    dated.forEach((p, i) => expectClose(p.value, undated[i]!.value, 9))
    withDates.rideMetabolicCurve.forEach((p, i) =>
      expectClose(p.value, without.rideMetabolicCurve[i]!.value, 12),
    )
    expect(withDates.comparison).toEqual(without.comparison)
    expect(withDates.equivalents).toEqual(without.equivalents)
  })

  it('compares the sports and finds running equivalents at the dated W/kg', () => {
    const result = combine(rides, dated)
    const without = combine([recent], plain)
    const headline = (r: typeof result) =>
      r.equivalents.find((e) => e.durationS === HEADLINE_DURATION_S)
    // Only the later ride matters at its W/kg, so the equivalent matches an analysis of it alone.
    expect(headline(result)?.runSpeed.p50).toBeCloseTo(headline(without)!.runSpeed.p50, 9)
    expect(headline(result)?.ridePowerW).toBeCloseTo(220, 9)
  })

  it('lists each activity with its mass only when masses are dated', () => {
    const summaries = combine(rides, dated).activities
    expect(summaries.map((a) => [a.id, a.massKg])).toEqual([
      ['recent', 70],
      ['old', 90],
    ])
    expect(combine(rides, plain).activities.every((a) => !('massKg' in a))).toBe(true)
  })

  it('prices the weekly trend at the mass of the ride that set each week', () => {
    const points = fitnessTrend(rides, dated, { durationS: HEADLINE_DURATION_S, windowDays: 14 })
    const oldWeek = points.find((p) => p.rideAtMs === old.startMs)
    const recentWeek = points.find((p) => p.rideAtMs === recent.startMs)
    expect(oldWeek?.rideWkg).toBeCloseTo(centralWkgFromWatts(260, 90), 12)
    expect(recentWeek?.rideWkg).toBeCloseTo(centralWkgFromWatts(220, 70), 12)
  })

  it('gives the record to the ride with the best power-to-weight, as the curve shows', () => {
    const holders = recordHolders(rides, dated)
    expect(holders.get('recent')).toContainEqual({
      kind: 'duration',
      durationS: HEADLINE_DURATION_S,
    })
    expect(holders.has('old')).toBe(false)
  })
})

describe('when the best watts and the best power-to-weight are different rides', () => {
  // 300 W at 90 kg is 3.33 W/kg. 290 W at 80 kg is 3.63 W/kg, so the lighter, weaker ride is the best.
  const heavy = ride('heavy', [2023, 6, 15], 300)
  const light = ride('light', [2025, 6, 15], 290)
  const two = [heavy, light]
  const settings: AthleteSettings = {
    massKg: 80,
    bikeMassKg: 9,
    measurements: [mass(90, '2023-01-01'), mass(80, '2024-01-01')],
  }
  const result = combine(two, settings)
  const at = (curve: { durationS: number }[]) => atHeadline(curve)

  it('takes the watts curve, the W/kg curve and the equivalents from one ride', () => {
    const watts = result.rideCurve[at(result.rideCurve)]!
    const wkg = result.rideMetabolicCurve[at(result.rideMetabolicCurve)]!
    expect(watts.activityId).toBe('light')
    expect(wkg.activityId).toBe('light')
    expect(watts.startIndex).toBe(wkg.startIndex)
    expect(watts.value).toBeCloseTo(290, 9)
    const equivalent = result.equivalents.find((e) => e.durationS === HEADLINE_DURATION_S)
    expect(equivalent?.ridePowerW).toBeCloseTo(290, 9)
    // Its running equivalent is the 290 W at 80 kg, not 290 W at another mass.
    expect(equivalent?.runSpeed.p50).toBeCloseTo(equivalentRunSpeed(290, 80, result.hr).p50, 9)
  })

  it('agrees for every duration that has a ride', () => {
    result.rideCurve.forEach((point, i) => {
      expect(point.activityId).toBe(result.rideMetabolicCurve[i]!.activityId)
    })
  })

  it('holds the record with that ride, and lists each ride with its own mass', () => {
    expect(recordHolders(two, settings).get('light')).toContainEqual({
      kind: 'duration',
      durationS: HEADLINE_DURATION_S,
    })
    expect(result.activities.map((a) => [a.id, a.massKg])).toEqual([
      ['light', 80],
      ['heavy', 90],
    ])
  })

  it('draws the previous period from the same ride, so two periods compare alike', () => {
    const curves = sportCurves(two, settings, result.bikeModel)
    expect(curves.rideCurve[at(curves.rideCurve)]!.activityId).toBe('light')
  })
})

describe('the period cache with dated masses', () => {
  it('reuses an analysis while the masses hold, and redoes it when a dated mass changes', () => {
    const cache = new PeriodCache()
    const first = cache.analysis(rides, dated)
    // A fresh but equal object, as each worker message brings, finds the same analysis.
    const equal = { ...dated, measurements: dated.measurements?.map((entry) => ({ ...entry })) }
    expect(cache.analysis(rides, equal)).toBe(first)
    // Another kind of setting does not touch the masses.
    const heartRate: Measurement = {
      kind: 'maxHeartRate',
      sport: 'ride',
      value: 180,
      from: '2024-01-01',
    }
    expect(
      cache.analysis(rides, { ...dated, measurements: [...(dated.measurements ?? []), heartRate] }),
    ).toBe(first)
    const heavier = { ...dated, measurements: [mass(95, '2023-01-01'), mass(70, '2024-01-01')] }
    expect(cache.analysis(rides, heavier)).not.toBe(first)
  })
})
