import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BIKE_MODEL,
  DURATIONS_S,
  EQUIVALENCE_DURATIONS_S,
  PROFILE_DURATIONS_S,
  RESTING_W_PER_KG,
} from '../constants'
import { smoothGrade, travelledDistance } from '../metabolic'
import { mulberry32 } from '../math'
import { airDensityStream } from '../physics/air'
import { crossCheck } from '../hr'
import { assessQuality } from '../quality'
import { generateActivity, sampleDataset } from '../synthetic'
import type {
  Activity,
  AthleteSettings,
  Curve,
  CriticalPowerFit,
  DigestCurvePoint,
  HrPoint,
} from '../types'
import { estimatePower, solveBikeModel } from '../virtualPower'
import { combine, equivalenceFor, equivalentRunSpeed, sportCurves } from './combine'
import { digestActivity } from './digestActivity'
import { atOrBelowCriticalPower } from './heartRateCrossCheck'
import { powerAt } from './terms'
import type { RideInputs } from './test/reference'
import { referenceRideStats, sumReferenceStats } from './test/reference'

const { athlete, activities } = sampleDataset()
const settings: AthleteSettings = { massKg: athlete.massKg, bikeMassKg: athlete.bikeMassKg }
const digests = activities.map((a) => digestActivity(a))
const result = combine(digests, settings)

const constant = (n: number, value: number) => new Float64Array(n).fill(value)

it('uses the same finite prior fallback for equivalent pace when heart-rate evidence conflicts', () => {
  const prior = equivalentRunSpeed(240, 75, null)
  for (const kappa of [3, 10]) {
    expect(equivalentRunSpeed(240, 75, { kappa, lnKappaSe: 0.05 })).toEqual(prior)
  }
})

it('prices equivalent run speed from 4000 draws by default', () => {
  expect(equivalentRunSpeed(240, 75, null)).toEqual(
    equivalentRunSpeed(240, 75, null, { draws: 4000 }),
  )
})

it('never mixes stored digests from an older model revision into current results', () => {
  const current = digests[0]!
  const stale = { ...current, modelRevision: 1 }
  expect(combine([stale, ...digests], settings)).toEqual(combine(digests, settings))
})

/** The per-sample inputs of an outdoor ride, as the calibration and the reference see them. */
function rideInputs(a: Activity): RideInputs {
  return {
    speed: a.speed,
    grade: smoothGrade(a.altitude, travelledDistance(a.speed)),
    power: a.power,
    valid: assessQuality(a).validMotion,
    airDensity: airDensityStream(a),
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

  it('reports no virtual accuracy when a power-meter ride has no climb to score', () => {
    const flat = digestActivity(
      generateActivity(
        athlete,
        {
          id: 'flat-ride',
          name: 'Flat ride',
          sport: 'ride',
          startMs: 0,
          durationS: 1800,
          effort: 'easy',
          terrain: 'flat',
        },
        7,
      ),
    )
    expect(flat.calibration).not.toBeNull()
    expect(flat.climbSections).toEqual([])
    expect(combine([flat], settings).virtualAccuracy).toBeNull()
  })

  it('rejects a body mass or bike mass that is not a positive finite number', () => {
    const bad: AthleteSettings[] = [
      { massKg: 0, bikeMassKg: 9 },
      { massKg: -1, bikeMassKg: 9 },
      { massKg: Number.NaN, bikeMassKg: 9 },
      { massKg: 75, bikeMassKg: 0 },
      { massKg: 75, bikeMassKg: Number.POSITIVE_INFINITY },
    ]
    for (const s of bad) {
      expect(() => combine(digests, s)).toThrow(RangeError)
      expect(() => combine([], s)).toThrow(RangeError)
    }
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
      indoor: newest.indoor,
      powerSource: newest.powerSource,
      flags: newest.flags,
      flagCounts: newest.flagCounts,
      maxHeartRate: newest.maxHeartRate,
      movingS: newest.movingS,
      avgHeartRate: newest.avgHeartRate,
      avgPowerW: newest.avgPowerW,
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
        estimatePower(input.speed, input.grade, totalMassKg, model, input.airDensity)
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
    const grade = smoothGrade(ride.altitude, travelledDistance(ride.speed))
    const estimate = estimatePower(
      ride.speed,
      grade,
      mass,
      DEFAULT_BIKE_MODEL,
      airDensityStream(ride),
    )
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
    // Cycling is judged against its own reference: 165 less the 6 bpm offset, since no ride got
    // higher than 150.
    expect(effort.rideHrFraction!).toBeCloseTo(150 / 159, 9)
  })

  it('judges cycling against the running maximum less the offset when no ride came close', () => {
    const run = digestActivity(activity('run', 'run', 1200, { heartRate: constant(1200, 170) }))
    const ride = digestActivity(activity('ride', 'ride', 1200, { power: constant(1200, 250) }))
    const r = combine([run, ride], settings)
    expect(r.runMaxHeartRate).toBe(170)
    expect(r.rideMaxHeartRate).toBe(164)
    // The ride's own highest heart rate, 150 bpm, is below the 164 bpm reference derived from running.
    expect(r.runObservedMaxHeartRate).toBe(170)
    expect(r.rideObservedMaxHeartRate).toBe(150)
    expect(r.maxHeartRate).toBe(170)
  })

  it('raises the running reference to a cycling maximum above the running maximum', () => {
    const run = digestActivity(activity('run', 'run', 1200, { heartRate: constant(1200, 160) }))
    const ride = digestActivity(
      activity('ride', 'ride', 1200, {
        power: constant(1200, 250),
        heartRate: constant(1200, 172),
      }),
    )
    const r = combine([run, ride], settings)
    expect(r.runMaxHeartRate).toBe(172)
    expect(r.rideMaxHeartRate).toBe(172)
    expect(r.runObservedMaxHeartRate).toBe(160)
    expect(r.rideObservedMaxHeartRate).toBe(172)
    expect(r.maxHeartRate).toBe(172)
  })

  it('has no sport heart-rate references without heart-rate data', () => {
    const noHr = digestActivity({ ...activity('a', 'run', 1200), hasHeartRate: false })
    const r = combine([noHr], settings)
    expect(r.runMaxHeartRate).toBeNull()
    expect(r.rideMaxHeartRate).toBeNull()
    expect(r.runObservedMaxHeartRate).toBeNull()
    expect(r.rideObservedMaxHeartRate).toBeNull()
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
      const grade = smoothGrade(ride.altitude, travelledDistance(ride.speed))
      const direct =
        estimatePower(ride.speed, grade, totalMassKg, DEFAULT_BIKE_MODEL, airDensityStream(ride))
          .subarray(seg.start, seg.end)
          .reduce((a, b) => a + b, 0) /
        (seg.end - seg.start)
      expect(seg.estimatedW / direct).toBeCloseTo(1, 6)
    }
  })

  it('keeps a heart-rate block at exactly twice resting', () => {
    const digest = digestActivity(activity('run', 'run', 1800))
    const values = [2 * RESTING_W_PER_KG, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8]
    const blocks = values.map((value, i) => ({ heartRate: 120 + 5 * i, value, terms: null }))
    const r = combine([{ ...digest, hrBlocks: blocks }], settings)
    expect(r.hr.run!.points.map((p) => p.metabolicPower)).toContain(2 * RESTING_W_PER_KG)
  })

  it('keeps heart-rate points at exactly critical power', () => {
    const cp: CriticalPowerFit = { cp: 2.5, wPrime: 0, cpSe: 0, r2: 1, nPoints: 4 }
    const at = (metabolicPower: number): HrPoint => ({
      metabolicPower,
      heartRate: 150,
      activityId: 'a',
    })
    const points = [at(2.4), at(2.5), at(2.6)]
    expect(atOrBelowCriticalPower(points, cp)).toEqual([points[0], points[1]])
    expect(atOrBelowCriticalPower(points, null)).toEqual(points)
  })
})

/** Durations at which `after` is below `before`. A missing value counts as a lower one. */
function loweredDurations(before: Curve, after: Curve): number[] {
  const out: number[] = []
  before.forEach((b, i) => {
    if (!Number.isFinite(b.value)) return
    const a = after[i]!
    if (!(a.value >= b.value)) out.push(b.durationS)
  })
  return out
}

describe('adding an activity', () => {
  const DAY_MS = 86_400_000
  const EFFORTS = ['easy', 'tempo', 'intervals', 'test'] as const
  const TERRAINS = ['flat', 'rolling', 'climb'] as const

  /** A synthetic run, a ride with a power meter, or a ride without one, from a seeded generator. */
  function randomActivity(rand: () => number, kind: 'run' | 'meter' | 'virtual', index: number) {
    return generateActivity(
      athlete,
      {
        id: `${kind}-${index}`,
        name: `${kind} ${index}`,
        sport: kind === 'run' ? 'run' : 'ride',
        startMs: index * DAY_MS,
        durationS: 1200 + Math.floor(rand() * 1200),
        effort: EFFORTS[Math.floor(rand() * EFFORTS.length)]!,
        terrain: TERRAINS[Math.floor(rand() * TERRAINS.length)]!,
        withPower: kind !== 'virtual',
      },
      1000 + index,
    )
  }

  function pick<T>(rand: () => number, xs: readonly T[]): T {
    return xs[Math.floor(rand() * xs.length)]!
  }

  const seeds = Array.from({ length: 12 }, (_, k) => k + 1)

  it.each(seeds)(
    'never lowers a run or power-meter best when such an activity is added (seed %i)',
    (seed) => {
      const rand = mulberry32(seed)
      const kinds = ['run', 'meter'] as const
      const base = Array.from({ length: 2 + Math.floor(rand() * 3) }, (_, i) =>
        randomActivity(rand, pick(rand, kinds), i),
      )
      const extra = randomActivity(rand, pick(rand, kinds), base.length)
      const before = combine(
        base.map((a) => digestActivity(a)),
        settings,
      )
      const after = combine(
        [...base, extra].map((a) => digestActivity(a)),
        settings,
      )
      expect(loweredDurations(before.runCurve, after.runCurve)).toEqual([])
      expect(loweredDurations(before.rideCurve, after.rideCurve)).toEqual([])
    },
  )

  it.each(seeds)(
    'never lowers any best when a ride without a power meter is added (seed %i)',
    (seed) => {
      const rand = mulberry32(seed)
      const kinds = ['run', 'meter', 'virtual'] as const
      const base = Array.from({ length: 2 + Math.floor(rand() * 3) }, (_, i) =>
        randomActivity(rand, pick(rand, kinds), i),
      )
      const extra = randomActivity(rand, 'virtual', base.length)
      const before = combine(
        base.map((a) => digestActivity(a)),
        settings,
      )
      const after = combine(
        [...base, extra].map((a) => digestActivity(a)),
        settings,
      )
      expect(loweredDurations(before.runCurve, after.runCurve)).toEqual([])
      expect(loweredDurations(before.rideCurve, after.rideCurve)).toEqual([])
    },
  )
})

describe('virtual values are priced with the bike model of the same analysis', () => {
  const totalMassKg = athlete.massKg + athlete.bikeMassKg
  const virtualIds = new Set(digests.filter((d) => d.powerSource === 'virtual').map((d) => d.id))

  /**
   * The stored entry a curve point's value came from. The envelope copies a value to shorter
   * durations with the same start, and a copy keeps the longer window's windowS. The raw window is
   * the entry whose windowS equals its durationS. Among raw windows with the point's start and a
   * duration at least the point's, the shortest is the source: a shorter one would have been
   * copied from it, or would itself be the source.
   */
  function sourceWindow(point: {
    activityId: string | null
    startIndex: number
    durationS: number
  }): DigestCurvePoint {
    const digest = digests.find((d) => d.id === point.activityId)!
    const raw = digest.curve.filter(
      (c) =>
        c.terms !== null &&
        c.startIndex === point.startIndex &&
        c.durationS >= point.durationS &&
        c.windowS === c.durationS,
    )
    const source = raw.reduce<DigestCurvePoint | undefined>(
      (best, c) => (best === undefined || c.durationS < best.durationS ? c : best),
      undefined,
    )
    expect(source).toBeDefined()
    return source!
  }

  // Without the Power Test, the virtual ride is the best ride at 420 s to 1800 s.
  const withoutPowerTest = combine(
    digests.filter((d) => d.name !== 'Power Test'),
    settings,
  )
  const virtualWinners = (curve: typeof withoutPowerTest.rideCurve) =>
    curve.filter((p) => p.activityId !== null && virtualIds.has(p.activityId))

  it('prices the virtual windows with the bike model fitted in the same analysis', () => {
    expect(withoutPowerTest.bikeModelSource).toBe('calibrated')
    const winners = virtualWinners(withoutPowerTest.rideCurve)
    expect(winners.length).toBeGreaterThan(0)
    for (const p of winners) {
      const terms = sourceWindow(p).terms!
      expect(powerAt(terms, totalMassKg, withoutPowerTest.bikeModel)).toBeCloseTo(p.value, 9)
    }
  })

  it('stores each virtual window with the air density of its own samples', () => {
    const winners = virtualWinners(withoutPowerTest.rideCurve)
    expect(winners.length).toBeGreaterThan(0)
    for (const p of winners) {
      const ride = activities.find((a) => a.id === p.activityId)!
      const source = sourceWindow(p)
      const density = airDensityStream(ride, assessQuality(ride).validGrade)
      let aeroSum = 0
      for (let i = source.startIndex; i < source.startIndex + source.windowS; i++) {
        aeroSum += 0.5 * density[i]! * ride.speed[i]! ** 3
      }
      expect(source.terms!.aero).toBeCloseTo(aeroSum / source.windowS, 9)
    }
  })

  it('reprices the same virtual windows when a power-meter ride is added, as documented', () => {
    // Adding the Power Test refits the bike model, so the same windows change value, in either
    // direction. This is the one documented exception to "adding an activity never lowers a best".
    expect(result.bikeModel).not.toEqual(withoutPowerTest.bikeModel)
    const winners = virtualWinners(withoutPowerTest.rideCurve)
    expect(winners.length).toBeGreaterThan(0)
    for (const p of winners) {
      const terms = sourceWindow(p).terms!
      expect(powerAt(terms, totalMassKg, result.bikeModel)).not.toBeCloseTo(p.value, 9)
    }
  })

  it('uses the default model for rides without a power meter alone', () => {
    const alone = combine(
      digests.filter((d) => d.powerSource === 'virtual'),
      settings,
    )
    expect(alone.bikeModelSource).toBe('default')
    expect(alone.bikeModel).toEqual(DEFAULT_BIKE_MODEL)
    const winners = alone.rideCurve.filter((p) => p.activityId !== null)
    expect(winners.length).toBeGreaterThan(0)
    for (const p of winners) {
      const terms = sourceWindow(p).terms!
      expect(powerAt(terms, totalMassKg, DEFAULT_BIKE_MODEL)).toBeCloseTo(p.value, 9)
    }
  })
})

describe('the measured ride curve', () => {
  const measuredIds = new Set(
    digests.filter((d) => d.sport === 'ride' && d.powerSource === 'measured').map((d) => d.id),
  )

  it('comes only from rides with a power meter, and never beats the ride curve', () => {
    const measured = result.rideMeasuredCurve.filter((point) => Number.isFinite(point.value))
    expect(measured.length).toBeGreaterThan(0)
    for (const point of measured) {
      expect(measuredIds.has(point.activityId ?? '')).toBe(true)
      const all = result.rideCurve.find((p) => p.durationS === point.durationS)!
      expect(point.value).toBeLessThanOrEqual(all.value + 1e-9)
    }
  })

  it('is empty without a ride that has a power meter', () => {
    const estimated = digests.filter((d) => d.sport !== 'ride' || d.powerSource !== 'measured')
    const curve = combine(estimated, settings).rideMeasuredCurve
    expect(curve.map((p) => p.durationS)).toEqual([...DURATIONS_S])
    expect(curve.every((p) => Number.isNaN(p.value) && p.activityId === null)).toBe(true)
  })

  it('does not move when only the body mass changes', () => {
    const heavier = combine(digests, { ...settings, massKg: settings.massKg + 10 })
    expect(heavier.rideMeasuredCurve).toEqual(result.rideMeasuredCurve)
  })
})

describe('sportCurves', () => {
  it('gives the same run and ride curves that combine reports, given combine’s bike model', () => {
    const digests = sampleDataset().activities.map(digestActivity)
    const settings = { massKg: 75, bikeMassKg: 9 }
    const combined = combine(digests, settings)
    expect(sportCurves(digests, settings, combined.bikeModel)).toEqual({
      runCurve: combined.runCurve,
      rideCurve: combined.rideCurve,
    })
  })

  it('prices rides with the bike model it is given', () => {
    const digests = sampleDataset().activities.map(digestActivity)
    const settings = { massKg: 75, bikeMassKg: 9 }
    const heavier = { ...DEFAULT_BIKE_MODEL, cda: DEFAULT_BIKE_MODEL.cda * 1.5 }
    // A ride on virtual power is priced by the bike model; a measured one is not.
    const virtual = digests.find(
      (digest) => digest.sport === 'ride' && digest.curve.some((point) => point.terms !== null),
    )
    expect(virtual).toBeDefined()
    const ride = virtual ? [virtual] : []
    const standard = sportCurves(ride, settings, DEFAULT_BIKE_MODEL).rideCurve
    const drag = sportCurves(ride, settings, heavier).rideCurve
    expect(drag.map((point) => point.value)).not.toEqual(standard.map((point) => point.value))
  })
})

describe('equivalenceFor', () => {
  const hrPoints = (slope: number) =>
    Array.from({ length: 40 }, (_, i) => ({
      metabolicPower: 6 + i * 0.1,
      heartRate: 120 + slope * i * 0.1 + (i % 3),
      activityId: `a${i}`,
    }))

  it('gives the same interval as equivalentRunSpeed for each power, under one model', () => {
    for (const hr of [null, crossCheck(hrPoints(2), hrPoints(2.4))]) {
      const equivalence = equivalenceFor(hr)
      for (const watts of [180, 250, 320]) {
        expect(equivalence(watts, 75)).toEqual(equivalentRunSpeed(watts, 75, hr))
      }
    }
  })

  it("prices a result's own equivalents again from the result's heart-rate check and the athlete's mass", () => {
    // The grade by duration prices the durations a combine leaves out this way, so it must agree with it.
    const equivalence = equivalenceFor(result.hr)
    expect(result.equivalents.length).toBeGreaterThan(0)
    for (const { ridePowerW, runSpeed } of result.equivalents) {
      expect(equivalence(ridePowerW, settings.massKg)).toEqual(runSpeed)
    }
  })

  it('leaves the combine at the cross-sport durations, which the grade by duration extends', () => {
    expect(result.equivalents.map((e) => e.durationS)).toEqual(
      EQUIVALENCE_DURATIONS_S.filter((durationS) =>
        result.rideCurve.some((p) => p.durationS === durationS && Number.isFinite(p.value)),
      ),
    )
    expect(PROFILE_DURATIONS_S).toEqual([
      180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200, 10800,
    ])
  })
})
