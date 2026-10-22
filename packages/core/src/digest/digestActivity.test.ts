import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE_MODEL, DURATIONS_S, PRIORS, RESTING_W_PER_KG } from '../constants'
import { smoothGrade } from '../metabolic'
import type { Activity, Sport } from '../types'
import { climbMask, estimatePower } from '../virtualPower'
import { digestActivity } from './digestActivity'
import { serializeDigest } from './serialize'
import { powerAt } from './terms'

const TRUE_MODEL = { crr: 0.006, cda: 0.35 }

interface Spec {
  id?: string
  sport?: Sport
  n: number
  startMs?: number
  /** Default 4 m/s. Distance is the running sum of speed. */
  speed?: Float64Array
  /** Altitude follows this gradient unless `altitude` is given. Default flat. */
  grade?: number
  altitude?: Float64Array
  /** Default 150 bpm. */
  heartRate?: Float64Array
  /** Given for a power meter. */
  power?: Float64Array
  indoor?: boolean
  noHeartRate?: boolean
  noAltitude?: boolean
}

/** A 1 Hz activity built from a spec. */
function activity(spec: Spec): Activity {
  const n = spec.n
  const speed = spec.speed ?? new Float64Array(n).fill(4)
  const distance = new Float64Array(n)
  for (let i = 1; i < n; i++) distance[i] = distance[i - 1]! + speed[i]!
  const grade = spec.grade ?? 0
  let altitude = spec.altitude ?? Float64Array.from(distance, (d) => 100 + grade * d)
  if (spec.noAltitude) altitude = new Float64Array(n).fill(NaN)
  return {
    id: spec.id ?? 'a',
    name: spec.id ?? 'a',
    sport: spec.sport ?? 'run',
    startMs: spec.startMs ?? 0,
    n,
    speed,
    distance,
    altitude,
    heartRate: spec.heartRate ?? new Float64Array(n).fill(150),
    power: spec.power ?? new Float64Array(n).fill(NaN),
    paused: new Uint8Array(n),
    hasPower: spec.power !== undefined,
    hasHeartRate: !spec.noHeartRate,
    hasAltitude: !spec.noAltitude,
    indoor: spec.indoor ?? false,
  }
}

/** Metabolic W/kg of running at speed v on the flat, with the prior-mean economy. */
const flatMetabolic = (v: number) => RESTING_W_PER_KG + PRIORS.runEconomyScale.mean * 3.6 * v

const constant = (n: number, value: number) => new Float64Array(n).fill(value)

/** A steady 8 m/s climb at 5%, for power and virtual-power tests. */
function climb(n: number, extra: Partial<Spec> = {}): Activity {
  return activity({
    id: 'climb',
    sport: 'ride',
    n,
    speed: constant(n, 8),
    grade: 0.05,
    heartRate: constant(n, 140),
    ...extra,
  })
}

/** Power a steady 8 m/s, 5% climb takes under the true model at the given mass. */
const climbPower = (mass: number, model = TRUE_MODEL) =>
  estimatePower(constant(10, 8), constant(10, 0.05), mass, model)[5]!

describe('digestActivity: summary', () => {
  it('summarises identity, duration, distance and heart rate', () => {
    const d = digestActivity(activity({ n: 10, id: 'x', startMs: 1234 }))
    expect(d.version).toBe(1)
    expect(d.id).toBe('x')
    expect(d.name).toBe('x')
    expect(d.sport).toBe('run')
    expect(d.startMs).toBe(1234)
    expect(d.durationS).toBe(10)
    expect(d.distanceM).toBe(36)
    expect(d.elevationGainM).toBe(0)
    expect(d.hasHeartRate).toBe(true)
    expect(d.indoor).toBe(false)
    expect(d.powerSource).toBe('none')
    expect(d.flags).toEqual([])
    expect(d.maxHeartRate).toBe(150)
    expect(d.calibration).toBeNull()
    expect(d.climbSections).toEqual([])
  })

  it('counts elevation gain with a 2 m hysteresis', () => {
    // 100 -> 101 (too small), 103 (+3), 102.5 (too small), 100 (back), 102 (+2).
    const altitude = Float64Array.from([100, 101, 103, 102.5, 100, 102])
    expect(digestActivity(activity({ n: 6, altitude })).elevationGainM).toBe(5)
  })

  it('skips missing altitude samples when counting elevation gain', () => {
    const altitude = Float64Array.from([100, NaN, 103])
    expect(digestActivity(activity({ n: 3, altitude })).elevationGainM).toBe(3)
  })

  it('reports an empty activity as zero distance with no windows', () => {
    const d = digestActivity(activity({ n: 0 }))
    expect(d.durationS).toBe(0)
    expect(d.distanceM).toBe(0)
    expect(d.maxHeartRate).toBeNull()
    expect(d.hrBlocks).toEqual([])
    expect(d.curve).toHaveLength(DURATIONS_S.length)
    expect(d.curve.every((p) => Number.isNaN(p.value) && p.startIndex === -1)).toBe(true)
  })

  it('carries the quality flags of the activity', () => {
    const heartRate = constant(200, 150)
    heartRate[100] = 240
    const d = digestActivity(activity({ n: 200, heartRate }))
    expect(d.flags.map((f) => f.kind)).toContain('hr-spike')
  })

  it('has no heart-rate windows or blocks without a heart-rate stream', () => {
    const d = digestActivity(activity({ n: 1200, noHeartRate: true }))
    expect(d.hasHeartRate).toBe(false)
    expect(d.maxHeartRate).toBeNull()
    expect(d.hrBlocks).toEqual([])
    expect(d.curve.every((p) => p.heartRate === null)).toBe(true)
  })
})

describe('digestActivity: runs', () => {
  it('stores gross metabolic W/kg at the prior-mean economy for every duration', () => {
    const d = digestActivity(activity({ n: 1200 }))
    expect(d.curve.map((p) => p.durationS)).toEqual([...DURATIONS_S])
    // Durations longer than the 1200 s activity have no window.
    for (const p of d.curve.filter((q) => q.durationS > 1200)) {
      expect(Number.isNaN(p.value)).toBe(true)
      expect(p.startIndex).toBe(-1)
    }
    for (const p of d.curve.filter((q) => q.durationS <= 1200)) {
      expect(p.value).toBeCloseTo(flatMetabolic(4), 9)
      // Every window ties, so any start is a valid best window.
      expect(p.startIndex).toBeGreaterThanOrEqual(0)
      expect(p.startIndex + p.durationS).toBeLessThanOrEqual(1200)
      expect(p.windowS).toBe(p.durationS)
      expect(p.heartRate).toBe(150)
      expect(p.terms).toBeNull()
    }
  })

  it('lends a longer window to a shorter duration with its own length and heart rate', () => {
    // 60 s hard, 300 s easy, 60 s hard. The 420 s window beats every 300 s window, so the 300 s
    // point takes the 420 s window's value, start, length and heart rate.
    const speed = Float64Array.from({ length: 420 }, (_, i) => (i < 60 || i >= 360 ? 5 : 3))
    const heartRate = Float64Array.from({ length: 420 }, (_, i) => (i < 60 || i >= 360 ? 165 : 150))
    const d = digestActivity(activity({ n: 420, speed, heartRate }))
    const p300 = d.curve.find((p) => p.durationS === 300)!
    const hard = flatMetabolic(5)
    const easy = flatMetabolic(3)
    expect(p300.windowS).toBe(420)
    expect(p300.startIndex).toBe(0)
    expect(p300.value).toBeCloseTo((120 * hard + 300 * easy) / 420, 9)
    expect(p300.heartRate).toBeCloseTo((120 * 165 + 300 * 150) / 420, 9)
    // The 300 s window on its own averages only 153 bpm, which is not the value stored.
    expect(p300.heartRate).not.toBeCloseTo((60 * 165 + 240 * 150) / 300, 6)
    expect(d.maxHeartRate).toBe(165)
  })

  it('takes heart-rate blocks after the first 600 s, with metabolic power and heart rate', () => {
    const d = digestActivity(activity({ n: 1200 }))
    expect(d.hrBlocks).toHaveLength(2)
    for (const block of d.hrBlocks) {
      expect(block.value).toBeCloseTo(flatMetabolic(4), 9)
      expect(block.heartRate).toBe(150)
      expect(block.terms).toBeNull()
    }
  })

  it('a run shorter than the skip has no heart-rate blocks', () => {
    expect(digestActivity(activity({ n: 600 })).hrBlocks).toEqual([])
  })
})

describe('digestActivity: rides with a power meter', () => {
  it('stores measured watts and a calibration of the outdoor ride', () => {
    const n = 1800
    const power = constant(n, climbPower(84))
    const d = digestActivity(climb(n, { power }))
    expect(d.powerSource).toBe('measured')
    const expected = estimatePower(constant(n, 8), constant(n, 0.05), 84, TRUE_MODEL)[900]!
    expect(d.curve[0]!.value).toBeCloseTo(expected, 6)
    expect(d.curve[0]!.terms).toBeNull()
    expect(d.calibration).not.toBeNull()
    expect(d.calibration!.blocks).toBe(60)
  })

  it('describes each climb section with its measured power and power terms', () => {
    const n = 1800
    const d = digestActivity(climb(n, { power: constant(n, climbPower(84)) }))
    // Grade is exactly 5% away from the ends, where the smoothing is not symmetric.
    const interior = d.climbSections.filter((s) => s.start >= 30 && s.end <= n - 31)
    expect(interior.length).toBeGreaterThan(0)
    for (const section of interior) {
      expect(section.end - section.start).toBeGreaterThanOrEqual(120)
      expect(section.measuredW).toBeCloseTo(climbPower(84), 6)
      expect(powerAt(section.terms, 84, TRUE_MODEL)).toBeCloseTo(section.measuredW, 6)
    }
    for (const section of d.climbSections) expect(section.measuredW).toBeGreaterThanOrEqual(50)
  })

  it('carries the mean measured watts in each heart-rate block', () => {
    const n = 1800
    const expected = constant(n, climbPower(84))
    const d = digestActivity(climb(n, { power: expected }))
    expect(d.hrBlocks).toHaveLength(4)
    for (const block of d.hrBlocks) {
      expect(block.value).toBeCloseTo(expected[0]!, 6)
      expect(block.terms).toBeNull()
    }
  })

  it('stores measured power but no calibration or climbs for an indoor ride', () => {
    const n = 1200
    const power = constant(n, 250)
    const d = digestActivity(climb(n, { power, indoor: true }))
    expect(d.powerSource).toBe('measured')
    expect(d.indoor).toBe(true)
    expect(d.curve[0]!.value).toBeCloseTo(250, 9)
    expect(d.calibration).toBeNull()
    expect(d.climbSections).toEqual([])
  })

  it('leaves climbs out of a ride whose measured power is below 50 W', () => {
    const n = 1800
    const d = digestActivity(climb(n, { power: constant(n, 30) }))
    expect(d.climbSections).toEqual([])
    expect(d.calibration!.blocks).toBe(60)
  })

  it('finds no climb sections on a ride with no altitude', () => {
    const n = 1200
    const d = digestActivity(
      activity({
        n,
        sport: 'ride',
        speed: constant(n, 8),
        power: constant(n, 300),
        noAltitude: true,
      }),
    )
    expect(d.climbSections).toEqual([])
    expect(d.flags.map((f) => f.kind)).toContain('missing-altitude')
  })
})

describe('digestActivity: rides without a power meter', () => {
  it('stores power terms of the best climb window for each duration, with no value', () => {
    const n = 1800
    const d = digestActivity(climb(n))
    expect(d.powerSource).toBe('virtual')
    expect(d.calibration).toBeNull()
    expect(d.climbSections).toEqual([])
    for (const p of d.curve) {
      expect(Number.isNaN(p.value)).toBe(true)
    }
    const p300 = d.curve.find((p) => p.durationS === 300)!
    expect(p300.startIndex).toBeGreaterThanOrEqual(0)
    expect(p300.windowS).toBeGreaterThanOrEqual(300)
    expect(p300.heartRate).toBe(140)
    expect(p300.terms).not.toBeNull()
  })

  it('evaluates the stored terms to the mean estimate of the window they describe', () => {
    const n = 1800
    const d = digestActivity(climb(n))
    const grade = smoothGrade(
      Float64Array.from({ length: n }, (_, i) => 100 + 0.05 * 8 * i),
      Float64Array.from({ length: n }, (_, i) => 8 * i),
    )
    const estimate = estimatePower(constant(n, 8), grade, 84, DEFAULT_BIKE_MODEL)
    for (const p of d.curve) {
      if (p.terms === null) continue
      const from = p.startIndex
      const to = from + p.windowS
      const direct = estimate.subarray(from, to).reduce((a, b) => a + b, 0) / p.windowS
      expect(powerAt(p.terms, 84, DEFAULT_BIKE_MODEL)).toBeCloseTo(direct, 6)
    }
  })

  it('stores terms for heart-rate blocks, with no value', () => {
    const n = 1800
    const d = digestActivity(climb(n))
    // The climb mask is off at the ends, so the last block may not qualify.
    expect(d.hrBlocks.length).toBeGreaterThanOrEqual(2)
    for (const block of d.hrBlocks) {
      expect(Number.isNaN(block.value)).toBe(true)
      expect(block.heartRate).toBe(140)
      expect(block.terms).not.toBeNull()
    }
  })

  it('has no heart-rate blocks without a heart-rate stream', () => {
    const d = digestActivity(climb(1800, { noHeartRate: true }))
    expect(d.hrBlocks).toEqual([])
    expect(d.curve.every((p) => p.heartRate === null)).toBe(true)
  })

  it('has no climb windows on the flat', () => {
    const d = digestActivity(climb(1200, { grade: 0 }))
    expect(d.powerSource).toBe('virtual')
    expect(d.curve.every((p) => p.terms === null && p.startIndex === -1)).toBe(true)
    expect(d.curve.every((p) => p.heartRate === null)).toBe(true)
    expect(d.hrBlocks).toEqual([])
  })

  it('has no climb windows indoors or without altitude', () => {
    for (const extra of [{ indoor: true }, { noAltitude: true }]) {
      const d = digestActivity(climb(1800, extra))
      expect(d.curve.every((p) => p.terms === null && Number.isNaN(p.value))).toBe(true)
      expect(d.hrBlocks).toEqual([])
    }
  })

  it('only chooses windows that the climb mask marks as climbing', () => {
    const n = 1800
    const grade = smoothGrade(
      Float64Array.from({ length: n }, (_, i) => 100 + 0.05 * 8 * i),
      Float64Array.from({ length: n }, (_, i) => 8 * i),
    )
    const valid = climbMask(grade, constant(n, 8))
    const d = digestActivity(climb(n))
    const chosen = d.curve.filter((p) => p.terms !== null)
    expect(chosen.length).toBeGreaterThan(0)
    for (const p of chosen) {
      for (let i = p.startIndex; i < p.startIndex + p.windowS; i++) expect(valid[i]).toBe(1)
    }
  })
})

describe('digestActivity: flags', () => {
  it('keeps at most 50 flags, earliest first, and the true count of every kind', () => {
    // 2 h at 250 W with a 2500 W spike every 20 s: each spike is its own flag, 17 s apart.
    const n = 7200
    const power = constant(n, 250)
    const spikes: number[] = []
    for (let i = 60; i < n - 2; i += 20) {
      power[i] = 2500
      spikes.push(i)
    }
    const d = digestActivity(activity({ n, sport: 'ride', speed: constant(n, 8), power }))
    expect(d.flagCounts).toEqual({ 'power-spike': spikes.length })
    expect(spikes.length).toBeGreaterThan(50)
    expect(d.flags).toHaveLength(50)
    expect(d.flags.map((f) => f.start)).toEqual(spikes.slice(0, 50).map((i) => i - 1))
  })

  it('stays small for a 2 h ride with a 2500 W spike every 4 s', () => {
    // Spikes 4 s apart merge into one flag for the whole ride, so the digest stays well under the
    // server's cap and the count is the number of merged flags.
    const n = 7200
    const power = constant(n, 250)
    for (let i = 60; i < n - 2; i += 4) power[i] = 2500
    const d = digestActivity(activity({ n, sport: 'ride', speed: constant(n, 8), power }))
    expect(d.flagCounts).toEqual({ 'power-spike': 1 })
    expect(d.flags).toHaveLength(1)
    expect(serializeDigest(d).length).toBeLessThan(16 * 1024)
  })

  it('reports no flag counts for a clean activity', () => {
    expect(digestActivity(activity({ n: 300 })).flagCounts).toEqual({})
  })
})

describe('digestActivity: surging climbs', () => {
  /** Mean power of each virtual window over the clamped estimate, relative to the stored terms. */
  function biasByWindow(amplitudeMs: number, periodS: number): number[] {
    const n = 1800
    const speed = Float64Array.from(
      { length: n },
      (_, i) => 8 + amplitudeMs * Math.sin((2 * Math.PI * i) / periodS),
    )
    const ride = activity({
      id: 'surge',
      sport: 'ride',
      n,
      speed,
      grade: 0.05,
      heartRate: constant(n, 140),
    })
    const d = digestActivity(ride)
    const grade = smoothGrade(ride.altitude, ride.distance)
    const estimate = estimatePower(ride.speed, grade, 84, DEFAULT_BIKE_MODEL)
    return d.curve
      .filter((p) => p.terms !== null)
      .map((p) => {
        const clamped = estimate.subarray(p.startIndex, p.startIndex + p.windowS)
        const mean = clamped.reduce((a, b) => a + b, 0) / p.windowS
        return (powerAt(p.terms!, 84, DEFAULT_BIKE_MODEL) - mean) / mean
      })
  }

  it('understates a 2 m/s surge (20 s period, 5% climb) by under 3%', () => {
    // Power terms are linear and the estimate used to choose windows is clamped at zero. Clamping
    // only raises the mean, so the stored value is at or below it. For this surge the bias is
    // about 0.01%, the size of the clamp effect on a climb where gravity dominates.
    const biases = biasByWindow(2, 20)
    expect(biases.length).toBeGreaterThan(5)
    expect(Math.max(...biases)).toBeLessThanOrEqual(1e-9)
    expect(Math.min(...biases)).toBeGreaterThan(-0.03)
  })

  it('shows the clamp bias exceeds 3% for a hard 4 m/s surge, so the bias is not always negligible', () => {
    // Deceleration on a surge drives the modelled power below zero for part of each period. Read
    // this as the limit of the linear approximation rather than a fixed bias.
    const biases = biasByWindow(4, 20)
    expect(Math.min(...biases)).toBeLessThan(-0.03)
  })
})
