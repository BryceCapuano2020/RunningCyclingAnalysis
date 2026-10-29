import '../test/warmSample'
import { describe, expect, it } from 'vitest'
import type { Measurement } from '../athlete/measurements'
import { PRIORS } from '../constants'
import { combine } from '../digest/combine'
import { digestActivity } from '../digest/digestActivity'
import { metabolicToFlatSpeed } from '../metabolic'
import { AnalysisSession } from '../session'
import { sampleDataset } from '../synthetic'
import type { AthleteSettings } from '../types'
import { ZONE_MEASURES, ZONE_SCHEMES } from './schemes'
import { zonesAt, zonesFor } from './zones'

const local = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12).getTime()

describe('zonesFor', () => {
  it("cuts a ride's threshold power at Coggan's seven levels", () => {
    const zones = zonesFor('power', 200)
    expect(zones.map((zone) => zone.name)).toEqual([
      'Active recovery',
      'Endurance',
      'Tempo',
      'Lactate threshold',
      'VO2max',
      'Anaerobic capacity',
      'Neuromuscular power',
    ])
    const lows = [0, 110, 150, 180, 210, 240, 300]
    lows.forEach((low, i) => expect(zones[i]?.low).toBeCloseTo(low, 9))
    expect(zones.at(-1)?.high).toBeNull()
  })

  it('cuts heart rate into five zones of maximum heart rate', () => {
    const zones = zonesFor('heartRate', 190)
    expect(zones.map((zone) => [zone.low, zone.high])).toEqual([
      [0, 114],
      [114, 133],
      [133, 152],
      [152, 171],
      [171, null],
    ])
  })

  it("cuts run speed at Friel's percents of threshold pace, slower pace meaning lower speed", () => {
    const zones = zonesFor('pace', 4)
    // Zone 1 is slower than 129% of threshold pace: under 4 / 1.29 m/s. Zone 5 is faster than 99%. Each cut is
    // moved to the nearest 0.05 m/s, the step of the digest's speed bins, so within 0.025 m/s of the cut.
    expect(zones[0]?.high).toBeCloseTo(4 / 1.29, 1)
    expect(Math.abs(zones[0]!.high! - 4 / 1.29)).toBeLessThanOrEqual(0.025 + 1e-9)
    expect(Math.abs(zones[3]!.low - 4 / 1.06)).toBeLessThanOrEqual(0.025 + 1e-9)
    expect(Math.abs(zones[4]!.low - 4 / 0.99)).toBeLessThanOrEqual(0.025 + 1e-9)
    expect(zones.map((zone) => zone.low)).toEqual([0, 3.1, 3.5, 3.75, 4.05])
    expect(zones[4]?.high).toBeNull()
  })

  it('starts a zone of whole numbers at the first whole number at or above the cut', () => {
    // 0.6, 0.7, 0.8 and 0.9 of 219 bpm are 131.4, 153.3, 175.2 and 197.1.
    expect(zonesFor('heartRate', 219).map((zone) => zone.low)).toEqual([0, 132, 154, 176, 198])
    // A cut that is exactly a whole number stays there, whatever the rounding of the product.
    expect(zonesFor('heartRate', 200).map((zone) => zone.low)).toEqual([0, 120, 140, 160, 180])
    // Power is moved to the nearest 5 W instead, the step of the digest's bins: 110.55, 150.75, 180.9, 211.05,
    // 241.2 and 301.5 W of 201 W are 110, 150, 180, 210, 240 and 300 W (301.5 is nearer 300 than 305).
    expect(zonesFor('power', 201).map((zone) => zone.low)).toEqual([
      0, 110, 150, 180, 210, 240, 300,
    ])
    expect(zonesFor('power', 267).map((zone) => zone.low)).toEqual([
      0, 145, 200, 240, 280, 320, 400,
    ])
    for (const measure of ['power', 'heartRate'] as const) {
      for (const reference of [137.3, 188.6, 250.4]) {
        for (const zone of zonesFor(measure, reference)) {
          expect(Number.isInteger(zone.low)).toBe(true)
          expect(zone.high === null || Number.isInteger(zone.high)).toBe(true)
        }
      }
    }
  })

  it('moves the cuts of a pace to the nearest step of the speed bins, since a speed is not a whole number', () => {
    // 4 / 1.29 = 3.1008 and 4 / 1.14 = 3.5088 are on the steps 3.10 and 3.50.
    expect(zonesFor('pace', 4)[1]?.low).toBeCloseTo(3.1, 12)
    expect(zonesFor('pace', 4)[2]?.low).toBeCloseTo(3.5, 12)
  })

  it('leaves no gap or overlap between zones, so every reading is in one zone', () => {
    for (const measure of ['power', 'heartRate', 'pace'] as const) {
      const zones = zonesFor(measure, 123)
      expect(zones).toHaveLength(ZONE_SCHEMES[measure].names.length)
      expect(zones[0]?.low).toBe(0)
      zones.slice(1).forEach((zone, i) => expect(zone.low).toBe(zones[i]!.high))
    }
  })

  it('keeps its choices in tables for every sport', () => {
    expect(ZONE_MEASURES.run).toEqual(['heartRate', 'pace'])
    expect(ZONE_MEASURES.ride).toEqual(['heartRate', 'power'])
  })
})

describe('zonesAt', () => {
  const { activities } = sampleDataset()
  const result = combine(
    activities.map((activity) => digestActivity(activity)),
    { massKg: 75, bikeMassKg: 9 },
  )
  const settings: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
  const find = (sets: ReturnType<typeof zonesAt>, sport: string, measure: string) =>
    sets.find((set) => set.sport === sport && set.measure === measure)

  it("estimates every reference the analysis has, from the app's own figures", () => {
    const sets = zonesAt(local(2025, 1, 1), settings, result)
    expect(sets.every((set) => set.source === 'estimated')).toBe(true)
    expect(find(sets, 'ride', 'heartRate')?.reference).toBe(Math.round(result.rideMaxHeartRate!))
    expect(find(sets, 'run', 'heartRate')?.reference).toBe(Math.round(result.runMaxHeartRate!))
    expect(find(sets, 'run', 'pace')?.reference).toBeCloseTo(
      metabolicToFlatSpeed(result.runCp!.cp),
      12,
    )
    // A power is a whole number of watts, so the reference is the figure the app shows, rounded.
    expect(find(sets, 'ride', 'power')?.reference).toBe(
      Math.round(result.rideCp!.cp * PRIORS.grossEfficiency.mean * 75),
    )
  })

  it('says which sports a heart-rate reference rests on', () => {
    const from = (estimates: Partial<typeof result>) =>
      find(zonesAt(local(2025, 1, 1), settings, { ...result, ...estimates }), 'ride', 'heartRate')
        ?.estimatedFrom
    // Its own highest heart rate stands, so it rests on the sport alone.
    expect(from({ rideMaxHeartRate: 175, rideObservedMaxHeartRate: 175 })).toEqual(['ride'])
    // Worked out from the runs, which are higher, it rests on both sports.
    expect(from({ rideMaxHeartRate: 183, rideObservedMaxHeartRate: 175 })).toEqual(['run', 'ride'])
    // No ride heart rate on file at all: it rests on the runs alone.
    expect(from({ rideMaxHeartRate: 183, rideObservedMaxHeartRate: null })).toEqual(['run'])
    expect(
      find(zonesAt(local(2025, 1, 1), settings, result), 'ride', 'power')?.estimatedFrom,
    ).toEqual(['ride'])
  })

  it('rests an entered reference on nothing', () => {
    const entries: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'ride', value: 181, from: '2020-01-01' },
    ]
    const sets = zonesAt(local(2025, 1, 1), { ...settings, measurements: entries }, result)
    expect(find(sets, 'ride', 'heartRate')?.estimatedFrom).toEqual([])
  })

  it('has nothing without a reference', () => {
    expect(zonesAt(local(2025, 1, 1), settings, null)).toEqual([])
  })

  it('prefers the dated entry in effect on the date, and marks it entered', () => {
    const entries: Measurement[] = [
      { kind: 'thresholdPower', sport: 'ride', value: 240, from: '2024-01-01' },
      { kind: 'thresholdPower', sport: 'ride', value: 260, from: '2025-01-01' },
      { kind: 'maxHeartRate', sport: 'run', value: 188, from: '2024-01-01' },
    ]
    const withEntries = { ...settings, measurements: entries }
    const early = find(zonesAt(local(2024, 6, 1), withEntries, result), 'ride', 'power')
    const late = find(zonesAt(local(2025, 6, 1), withEntries, result), 'ride', 'power')
    expect([early?.source, early?.reference]).toEqual(['entered', 240])
    expect([late?.source, late?.reference]).toEqual(['entered', 260])
    // The run's heart rate is entered, and the rest stay estimated.
    const sets = zonesAt(local(2024, 6, 1), withEntries, result)
    expect(find(sets, 'run', 'heartRate')?.source).toBe('entered')
    expect(find(sets, 'ride', 'heartRate')?.source).toBe('estimated')
  })

  it('uses an entry even without an analysis', () => {
    const entries: Measurement[] = [
      { kind: 'thresholdPace', sport: 'run', value: 3.5, from: '2024-01-01' },
    ]
    const sets = zonesAt(local(2024, 2, 1), { ...settings, measurements: entries }, null)
    expect(sets.map((set) => [set.sport, set.measure, set.source])).toEqual([
      ['run', 'pace', 'entered'],
    ])
  })

  it('prices an estimated ride threshold at the mass of the date', () => {
    const entries: Measurement[] = [
      { kind: 'massKg', value: 90, from: '2023-01-01' },
      { kind: 'massKg', value: 70, from: '2025-01-01' },
    ]
    const withMass = { ...settings, measurements: entries }
    const before = find(zonesAt(local(2024, 1, 1), withMass, result), 'ride', 'power')!
    const after = find(zonesAt(local(2025, 6, 1), withMass, result), 'ride', 'power')!
    // Each is a whole number of watts, so the ratio holds to a watt in 200.
    expect(before.reference / after.reference).toBeCloseTo(90 / 70, 2)
  })
})

describe('zonesAt, the reference and the zones cut from it', () => {
  const settings: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

  it('cuts a whole-number measure’s zones from the reference as shown, rounded', () => {
    const entries: Measurement[] = [
      { kind: 'maxHeartRate', sport: 'run', value: 187.6, from: '2020-01-01' },
    ]
    const [set] = zonesAt(local(2025, 1, 1), { ...settings, measurements: entries }, null)
    expect(set?.reference).toBe(188)
    // The edges are worked out from 188, the figure Profile shows, not from 187.6.
    expect(set?.zones.map((zone) => zone.low)).toEqual(zonesFor('heartRate', 188).map((z) => z.low))
  })

  it('leaves a pace reference as it is', () => {
    const entries: Measurement[] = [
      { kind: 'thresholdPace', sport: 'run', value: 3.4567, from: '2020-01-01' },
    ]
    const [set] = zonesAt(local(2025, 1, 1), { ...settings, measurements: entries }, null)
    expect(set?.reference).toBe(3.4567)
  })
})

describe('AnalysisSession.zonesAt', () => {
  it('answers from the analysis the session holds', () => {
    const session = new AnalysisSession()
    const settings: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
    session.loadSample(settings)
    const sets = session.zonesAt(Date.now(), settings)
    expect(sets.length).toBeGreaterThan(0)
    expect(sets.every((set) => set.source === 'estimated')).toBe(true)
  })
})
