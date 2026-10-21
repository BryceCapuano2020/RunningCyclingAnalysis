import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE_MODEL, DURATIONS_S, RESTING_W_PER_KG } from '../constants'
import { smoothGrade } from '../metabolic'
import { assessQuality } from '../quality'
import { sampleDataset } from '../synthetic'
import type { Activity, AthleteSettings } from '../types'
import { estimatePower, solveBikeModel } from '../virtualPower'
import { combine } from './combine'
import { digestActivity } from './digestActivity'
import type { RideInputs } from './test/reference'
import { referenceRideStats, sumReferenceStats } from './test/reference'

const { athlete, activities } = sampleDataset()
const settings: AthleteSettings = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }
const digests = activities.map((a) => digestActivity(a))
const result = combine(digests, settings)

const constant = (n: number, value: number) => new Float64Array(n).fill(value)

/** The per-sample inputs of an outdoor ride, as the calibration and the reference see them. */
function rideInputs(a: Activity): RideInputs {
  return {
    speed: a.speed,
    grade: smoothGrade(a.altitude, a.distance),
    power: a.power,
    valid: assessQuality(a).validMotion,
  }
}

const isCalibrationRide = (a: Activity) => a.sport === 'ride' && a.hasPower && !a.indoor

/** Hand-built activity: distance is the running sum of speed, altitude follows the grade. */
function activity(
  id: string,
  sport: Activity['sport'],
  n: number,
  parts: Partial<Activity> & { grade?: number } = {},
): Activity {
  const speed = parts.speed ?? constant(n, 4)
  const distance = new Float64Array(n)
  for (let i = 1; i < n; i++) distance[i] = distance[i - 1]! + speed[i]!
  const grade = parts.grade ?? 0
  const altitude = Float64Array.from(distance, (d) => 100 + grade * d)
  return {
    id,
    name: id,
    sport,
    startMs: parts.startMs ?? 0,
    n,
    speed,
    distance,
    altitude,
    heartRate: parts.heartRate ?? constant(n, 150),
    power: parts.power ?? constant(n, NaN),
    paused: new Uint8Array(n),
    hasPower: parts.power !== undefined,
    hasHeartRate: true,
    hasAltitude: true,
    indoor: parts.indoor ?? false,
  }
}

describe('combine', () => {
  it('combines no digests into an empty analysis', () => {
    const empty = combine([], settings)
    expect(empty.activities).toEqual([])
    for (const curve of [empty.runCurve, empty.rideCurve, empty.rideMetabolicCurve]) {
      expect(curve.map((p) => p.durationS)).toEqual([...DURATIONS_S])
      expect(curve.every((p) => Number.isNaN(p.value) && p.activityId === null)).toBe(true)
    }
    expect(empty.hr).toEqual({ run: null, ride: null, kappa: null, lnKappaSe: null })
    expect(empty.comparison).toEqual({ prior: [], calibrated: null })
    expect(empty.runCp).toBeNull()
    expect(empty.rideCp).toBeNull()
    expect(empty.equivalents).toEqual([])
    expect(empty.effort).toEqual([])
    expect(empty.maxHeartRate).toBeNull()
    expect(empty.bikeModel).toEqual(DEFAULT_BIKE_MODEL)
    expect(empty.virtualAccuracy).toBeNull()
  })

  it('lists activities newest first, summarised from their digests', () => {
    const starts = result.activities.map((a) => a.startMs)
    expect(starts).toEqual([...starts].sort((a, b) => b - a))
    const newest = digests.reduce((a, b) => (b.startMs > a.startMs ? b : a))
    expect(result.activities[0]).toEqual({
      id: newest.id,
      name: newest.name,
      sport: newest.sport,
      startMs: newest.startMs,
      durationS: newest.durationS,
      distanceM: newest.distanceM,
      elevationGainM: newest.elevationGainM,
      hasHeartRate: newest.hasHeartRate,
      powerSource: newest.powerSource,
      flags: newest.flags,
    })
  })

  it('does not depend on the order of the digests', () => {
    expect(combine([...digests].reverse(), settings)).toEqual(result)
    const rotated = [...digests.slice(3), ...digests.slice(0, 3)]
    expect(combine(rotated, settings)).toEqual(result)
  })

  it('rebuilds the bike model from the summed statistics at the total mass, for two masses', () => {
    const rides = activities.filter(isCalibrationRide).map(rideInputs)
    const referenceModel = (totalMassKg: number) =>
      solveBikeModel(sumReferenceStats(rides.map((r) => referenceRideStats(r, totalMassKg))))

    expect(result.bikeModel).not.toEqual(DEFAULT_BIKE_MODEL)
    const reference = referenceModel(athlete.massKg + athlete.bikeMassKg)
    expect(result.bikeModel.crr / reference.crr).toBeCloseTo(1, 9)
    expect(result.bikeModel.cda / reference.cda).toBeCloseTo(1, 9)

    const other = combine(digests, { massKg: 60, bikeMassKg: 12 })
    const otherReference = referenceModel(72)
    expect(other.bikeModel.crr / otherReference.crr).toBeCloseTo(1, 9)
    expect(other.bikeModel.cda / otherReference.cda).toBeCloseTo(1, 9)
  })

  it('scores the virtual power meter with each ride left out of the fit', () => {
    const rides = activities.filter(isCalibrationRide)
    const inputs = rides.map(rideInputs)
    const totalMassKg = athlete.massKg + athlete.bikeMassKg
    const perRide = inputs.map((r) => referenceRideStats(r, totalMassKg))
    const acc = result.virtualAccuracy!

    expect(acc.nSegments).toBe(acc.segments.length)
    expect(acc.nSegments).toBeGreaterThan(0)
    const calibrationIds = new Set(rides.map((a) => a.id))
    for (const seg of acc.segments) {
      expect(calibrationIds.has(seg.activityId)).toBe(true)
      const k = rides.findIndex((a) => a.id === seg.activityId)
      const model = solveBikeModel(sumReferenceStats(perRide.filter((_, j) => j !== k)))
      const input = inputs[k]!
      const estimated =
        estimatePower(input.speed, input.grade, totalMassKg, model)
          .subarray(seg.start, seg.end)
          .reduce((a, b) => a + b, 0) /
        (seg.end - seg.start)
      expect(Math.abs(seg.estimatedW - estimated) / estimated).toBeLessThan(0.005)
    }
  })

  it('values a ride without a power meter with the default model at the total mass', () => {
    // Only a virtual ride, so there is no calibration and the default bike model applies. The total
    // mass equals the selection mass, so the envelope picks the same windows as the digest did.
    const n = 1800
    const ride = activity('climb', 'ride', n, { grade: 0.05, speed: constant(n, 8) })
    const digest = digestActivity(ride)
    const mass = 84
    const r = combine([digest], { massKg: 72, bikeMassKg: 12 })
    expect(r.bikeModel).toEqual(DEFAULT_BIKE_MODEL)

    const window = digest.curve.find((p) => p.durationS === 300)!
    const point = r.rideCurve.find((p) => p.durationS === 300)!
    expect(point.activityId).toBe('climb')
    // Every window of this steady climb has the same value, so only the value is compared.
    const grade = smoothGrade(ride.altitude, ride.distance)
    const estimate = estimatePower(ride.speed, grade, mass, DEFAULT_BIKE_MODEL)
    const direct =
      estimate
        .subarray(window.startIndex, window.startIndex + window.windowS)
        .reduce((a, b) => a + b, 0) / window.windowS
    expect(point.value / direct).toBeCloseTo(1, 9)
  })

  it('checks each effort against the heart rate of the window its value came from', () => {
    // Run: 60 s hard, 300 s easy, 60 s hard, so the 300 s point is backed by the 420 s window.
    // Heart rate is 165 bpm on the hard parts and 150 bpm on the easy part.
    const run = activity('run', 'run', 420, {
      speed: Float64Array.from({ length: 420 }, (_, i) => (i < 60 || i >= 360 ? 5 : 3)),
      heartRate: Float64Array.from({ length: 420 }, (_, i) => (i < 60 || i >= 360 ? 165 : 150)),
    })
    const ride = activity('ride', 'ride', 1200, { power: constant(1200, 250) })
    const r = combine([digestActivity(run), digestActivity(ride)], settings)

    expect(r.maxHeartRate).toBe(165)
    const effort = r.effort.find((e) => e.durationS === 300)!
    expect(effort.runHrFraction!).toBeCloseTo((120 * 165 + 300 * 150) / 420 / 165, 9)
    expect(effort.rideHrFraction!).toBeCloseTo(150 / 165, 9)
  })

  it('does not change the run curve or the watts of power meters when only mass changes', () => {
    const powerMeters = digests.filter((d) => d.powerSource !== 'virtual')
    const base = combine(powerMeters, settings)
    const heavier = combine(powerMeters, { ...settings, massKg: settings.massKg * 1.1 })
    expect(heavier.runCurve).toEqual(base.runCurve)
    expect(heavier.rideCurve).toEqual(base.rideCurve)
    base.rideMetabolicCurve.forEach((p, i) => {
      const q = heavier.rideMetabolicCurve[i]!
      if (Number.isFinite(p.value)) expect(q.value / p.value).toBeCloseTo(1 / 1.1, 9)
    })
  })

  it('reports the highest heart rate across all activities', () => {
    const highest = Math.max(...digests.map((d) => d.maxHeartRate ?? -Infinity))
    expect(result.maxHeartRate).toBe(highest)
    expect(Math.abs(result.maxHeartRate! - athlete.hrMax)).toBeLessThan(3)
  })

  it('has no heart-rate maximum when no activity recorded heart rate', () => {
    const noHr = digestActivity({ ...activity('a', 'run', 1200), hasHeartRate: false })
    expect(noHr.maxHeartRate).toBeNull()
    expect(combine([noHr], settings).maxHeartRate).toBeNull()
  })

  it('drops heart-rate blocks below twice resting before the cross-check', () => {
    // Sixteen 300 s blocks after the first 600 s. Even blocks at 0.2 m/s cost resting power and
    // are below the floor, so removing them from the digest must change nothing.
    const n = 600 + 300 * 16
    const speed = Float64Array.from({ length: n }, (_, i) => {
      const k = Math.floor((i - 600) / 300)
      return i < 600 || k % 2 === 0 ? 0.2 : 2 + 0.1 * k
    })
    const heartRate = Float64Array.from({ length: n }, (_, i) => {
      const k = Math.floor((i - 600) / 300)
      return i < 600 ? 120 : 120 + 2 * k
    })
    const digest = digestActivity(activity('blocks', 'run', n, { speed, heartRate }))
    expect(digest.hrBlocks).toHaveLength(16)
    const aboveFloor = digest.hrBlocks.filter((b) => b.value >= 2 * RESTING_W_PER_KG)
    expect(aboveFloor).toHaveLength(8)
    expect(combine([{ ...digest, hrBlocks: aboveFloor }], settings).hr).toEqual(
      combine([digest], settings).hr,
    )
  })

  it('scores a single ride with the default model when it is the only calibration ride', () => {
    const n = 1800
    const climbPower = constant(n, 300)
    const ride = activity('solo', 'ride', n, {
      grade: 0.05,
      speed: constant(n, 8),
      power: climbPower,
    })
    const r = combine([digestActivity(ride)], { massKg: 72, bikeMassKg: 12 })
    expect(r.virtualAccuracy!.nSegments).toBeGreaterThan(0)
    const totalMassKg = 84
    for (const seg of r.virtualAccuracy!.segments) {
      const grade = smoothGrade(ride.altitude, ride.distance)
      const direct =
        estimatePower(ride.speed, grade, totalMassKg, DEFAULT_BIKE_MODEL)
          .subarray(seg.start, seg.end)
          .reduce((a, b) => a + b, 0) /
        (seg.end - seg.start)
      expect(seg.estimatedW / direct).toBeCloseTo(1, 6)
    }
  })
})
