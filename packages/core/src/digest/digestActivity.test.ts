import { describe, expect, it } from 'vitest'
import { DEFAULT_BIKE_MODEL, DURATIONS_S, PRIORS, RESTING_W_PER_KG, RHO_AIR } from '../constants'
import { MIN_RUN_SPEED_MS, smoothGrade } from '../metabolic'
import { airDensity, airDensityStream } from '../physics/air'
import type { Activity, Sport } from '../types'
import { climbMask, estimatePower } from '../virtualPower'
import { digestActivity } from './digestActivity'
import { MODEL_REVISION } from './modelRevision'
import { serializeDigest } from './serialize'
import { powerAt } from './terms'
import { syntheticActivity as activity, type Spec } from './test/syntheticActivity'

const TRUE_MODEL = { crr: 0.006, cda: 0.35 }

/** Metabolic W/kg of running at speed v on the flat, with the prior-mean economy. */
const flatMetabolic = (v: number) => RESTING_W_PER_KG + PRIORS.runEconomyScale.mean * 3.9 * v

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
    expect(d.modelRevision).toBe(MODEL_REVISION)
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

  it('reports the distance of a single-sample activity', () => {
    const distance = Float64Array.from([42])
    expect(digestActivity({ ...activity({ n: 1 }), distance }).distanceM).toBe(42)
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

  it('does not let an altitude spike smear into run power or elevation gain', () => {
    const altitude = constant(180, 100)
    altitude[90] = 115
    const d = digestActivity(activity({ n: 180, altitude }))
    expect(d.flags.map((flag) => flag.kind)).toContain('altitude-jump')
    expect(d.elevationGainM).toBe(0)
    expect(d.curve[0]!.value).toBeCloseTo(flatMetabolic(4), 9)
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
  it('keeps measured power when a GPS speed spike is flagged', () => {
    const speed = constant(120, 8)
    speed[60] = 16
    const d = digestActivity(activity({ n: 120, sport: 'ride', speed, power: constant(120, 250) }))
    expect(d.flags.map((flag) => flag.kind)).toContain('speed-spike')
    expect(d.curve[0]!.value).toBe(250)
  })

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
    // Power follows the ride's own air density, so the stored terms reproduce it sample by sample.
    const power = estimatePower(
      constant(n, 8),
      constant(n, 0.05),
      84,
      TRUE_MODEL,
      airDensityStream(climb(n)),
    )
    const d = digestActivity(climb(n, { power }))
    // Grade is exactly 5% away from the ends, where the smoothing is not symmetric.
    const interior = d.climbSections.filter((s) => s.start >= 30 && s.end <= n - 31)
    expect(interior.length).toBeGreaterThan(0)
    for (const section of interior) {
      expect(section.end - section.start).toBeGreaterThanOrEqual(120)
      const window = power.subarray(section.start, section.end)
      expect(section.measuredW).toBeCloseTo(window.reduce((a, b) => a + b, 0) / window.length, 6)
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
    const density = airDensityStream(climb(n))
    const estimate = estimatePower(constant(n, 8), grade, 84, DEFAULT_BIKE_MODEL, density)
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

  it('stores aero terms with the air density of each sample altitude', () => {
    const n = 1800
    const altitude = Float64Array.from({ length: n }, (_, i) => 2000 + 0.05 * 8 * i)
    const d = digestActivity(climb(n, { altitude }))
    const density = airDensityStream(climb(n, { altitude }))
    const p = d.curve.find((c) => c.terms !== null && c.windowS === 300)!
    let aero = 0
    for (let i = p.startIndex; i < p.startIndex + p.windowS; i++) {
      expect(density[i]).toBe(airDensity(altitude[i]!))
      aero += 0.5 * density[i]! * 8 ** 3
    }
    expect(p.terms!.aero).toBeCloseTo(aero / p.windowS, 9)
    // Sea-level density would give 0.5 * RHO_AIR * 8^3; at 2,000 m the ratio is about 0.82.
    expect(p.terms!.aero / (0.5 * RHO_AIR * 8 ** 3)).toBeCloseTo(airDensity(2000) / RHO_AIR, 1)
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

describe('digestActivity: altitude steps and missing altitude', () => {
  /** 1800 s at `speedMs`, a 60 s pause from 1000 s, then an 80 m altitude step at 1060 s. */
  function steppedAfterPause(sport: Sport, speedMs: number): Activity {
    const n = 1800
    const speed = constant(n, speedMs)
    speed.fill(0, 1000, 1060)
    const paused = new Uint8Array(n)
    paused.fill(1, 1000, 1060)
    const altitude = constant(n, 100)
    altitude.fill(180, 1060)
    return activity({ n, sport, speed, paused, altitude })
  }

  it('masks an altitude step that follows a pause, so a flat run keeps its flat 5 s best', () => {
    const d = digestActivity(steppedAfterPause('run', 3.5))
    expect(d.flags.map((flag) => flag.kind)).toContain('altitude-jump')
    expect(d.curve.find((p) => p.durationS === 5)!.value).toBeCloseTo(flatMetabolic(3.5), 6)
  })

  it('gives a virtual ride no climb window when its only steep grade is that step', () => {
    const d = digestActivity(steppedAfterPause('ride', 7))
    expect(d.powerSource).toBe('virtual')
    expect(d.curve.every((p) => p.terms === null)).toBe(true)
  })

  it('still excludes moving outdoor running without altitude and flags the reason', () => {
    const d = digestActivity(activity({ n: 1500, noAltitude: true }))
    expect(d.curve.every((p) => Number.isNaN(p.value))).toBe(true)
    expect(d.hrBlocks).toEqual([])
    const flag = d.flags.find((f) => f.kind === 'missing-altitude')!
    expect(flag.message).toContain('grade-based')
  })

  it('keeps a power-meter ride without altitude on measured power, but out of calibration', () => {
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
    expect(d.powerSource).toBe('measured')
    expect(d.curve[0]!.value).toBe(300)
    expect(d.calibration!.blocks).toBe(0)
    expect(d.climbSections).toEqual([])
  })

  it('does not let a paused stop make a run window that spans it unusable', () => {
    const n = 600
    const speed = constant(n, 4)
    speed.fill(0, 200, 260)
    const paused = new Uint8Array(n)
    paused.fill(1, 200, 260)
    const d = digestActivity(activity({ n, speed, paused }))
    expect(d.curve.find((p) => p.durationS === 600)!.value).toBeGreaterThan(0)
  })

  it('uses resting cost across the same stop when it is not paused', () => {
    const n = 600
    const speed = constant(n, 4)
    speed.fill(0, 200, 260)
    const d = digestActivity(activity({ n, speed }))
    const p = d.curve.find((point) => point.durationS === 600)!
    const expected = (540 * flatMetabolic(4) + 60 * RESTING_W_PER_KG) / 600
    expect(p.value).toBeCloseTo(expected, 8)
  })

  it('keeps long run windows across a brief unpaused stop and charges resting cost', () => {
    const n = 40 * 60
    const speed = constant(n, 4)
    const stopStart = 19 * 60 + 50
    // Smoothly decelerate for 10 s, stand for 25 s, then smoothly accelerate for 10 s.
    for (let k = 0; k < 10; k++) speed[stopStart + k] = (4 * (9 - k)) / 10
    speed.fill(0, stopStart + 10, stopStart + 35)
    for (let k = 0; k < 10; k++) speed[stopStart + 35 + k] = (4 * (k + 1)) / 10
    const d = digestActivity(activity({ n, speed }))
    const p20 = d.curve.find((p) => p.durationS === 1200)!
    const p30 = d.curve.find((p) => p.durationS === 1800)!
    expect(Number.isFinite(p20.value)).toBe(true)
    expect(Number.isFinite(p30.value)).toBe(true)
    let expected30 = 0
    for (let i = p30.startIndex; i < p30.startIndex + p30.windowS; i++) {
      const v = speed[i]!
      expected30 += v < MIN_RUN_SPEED_MS ? RESTING_W_PER_KG : flatMetabolic(v)
    }
    expect(p30.value).toBeCloseTo(expected30 / p30.windowS, 8)
    expect(p30.value).toBeLessThan(flatMetabolic(4))
  })
})

describe('digestActivity: climb sections', () => {
  it('never lets a power spike into a climb section', () => {
    const n = 1800
    const power = constant(n, climbPower(84))
    power[900] = 2500
    const d = digestActivity(climb(n, { power }))
    expect(d.climbSections.some((s) => s.start <= 900 && 900 < s.end)).toBe(false)
    expect(d.climbSections.length).toBeGreaterThan(0)
    for (const section of d.climbSections) {
      expect(section.measuredW).toBeCloseTo(climbPower(84), 6)
    }
  })

  it('keeps a climb whose measured power is exactly 50 W', () => {
    const n = 1800
    const d = digestActivity(climb(n, { power: constant(n, 50) }))
    expect(d.climbSections.length).toBeGreaterThan(0)
    expect(d.climbSections.every((s) => s.measuredW === 50)).toBe(true)
  })

  it('keeps a climb whose measured power is 52 W', () => {
    const n = 1800
    const d = digestActivity(climb(n, { power: constant(n, 52) }))
    expect(d.climbSections.length).toBeGreaterThan(0)
  })

  it('drops a climb whose measured power is 49 W', () => {
    const n = 1800
    const d = digestActivity(climb(n, { power: constant(n, 49) }))
    expect(d.climbSections).toEqual([])
  })
})

describe('digestActivity: distance bests', () => {
  it('gives a run its best times at the record distances it covers', () => {
    // 4 m/s for 2500 s is 10 km, so all four record distances are covered.
    const d = digestActivity(activity({ n: 2501 }))
    expect(d.distanceBests?.map((b) => b.distanceM)).toEqual([1000, 1609.344, 5000, 10000])
    expect(d.distanceBests?.[0]?.seconds).toBeCloseTo(250, 9)
    expect(d.distanceBests?.[3]?.seconds).toBeCloseTo(2500, 9)
  })

  it('gives a run under 1 km an empty list', () => {
    expect(digestActivity(activity({ n: 100 })).distanceBests).toEqual([])
  })

  it('gives a ride no distance bests field at all', () => {
    const d = digestActivity(activity({ n: 2501, sport: 'ride' }))
    expect(d).not.toHaveProperty('distanceBests')
  })

  it('gives distance bests to a run with no altitude, since altitude affects grade, not distance', () => {
    // The run curve needs grade, so it is empty here. Distance and time do not, so the bests stand.
    const d = digestActivity(activity({ n: 2501, noAltitude: true }))
    expect(d.curve.every((p) => Number.isNaN(p.value))).toBe(true)
    expect(d.distanceBests?.map((b) => b.distanceM)).toEqual([1000, 1609.344, 5000, 10000])
  })
})

describe('digestActivity: distance bests across a recording gap', () => {
  /** A steady 3 m/s run with a 600 s gap of `gapSpeed` (NaN or 0) written as recorded. */
  function gappedRun(gapSpeed: number, paused: boolean) {
    const n = 1500
    const speed = Float64Array.from({ length: n }, (_, i) => (i >= 301 && i < 900 ? gapSpeed : 3))
    const a = activity({ n, speed })
    // Distance is held through the gap and then steps by the distance the gap covered. Altitude is
    // flat, so the helper's altitude from the original distance does not carry its NaN gap over.
    a.distance = Float64Array.from({ length: n }, (_, i) =>
      i <= 300 ? 3 * i : i < 900 ? 900 : 2700 + 3 * (i - 900),
    )
    a.altitude = new Float64Array(n).fill(100)
    if (paused) a.paused = Uint8Array.from({ length: n }, (_, i) => (i >= 301 && i < 900 ? 1 : 0))
    return a
  }

  it('does not let a best cross a 600 s unflagged gap that the distance steps over', () => {
    // The gap keeps a finite 3 m/s, so no quality flag marks it. The best kilometre is 333 s.
    const d = digestActivity(gappedRun(3, false))
    expect(d.distanceBests?.find((b) => b.distanceM === 1000)?.seconds).toBeCloseTo(1000 / 3, 6)
  })

  it('does not let a best cross a gap whose speed is not finite', () => {
    const d = digestActivity(gappedRun(NaN, false))
    expect(d.distanceBests?.find((b) => b.distanceM === 1000)?.seconds).toBeCloseTo(1000 / 3, 6)
  })

  it('counts a timer-paused gap in elapsed time, as a race clock does', () => {
    // 4 m/s for 125 s, a 600 s pause at zero speed, then 125 s more: the whole 1000 m takes 850 s.
    const n = 851
    const speed = Float64Array.from({ length: n }, (_, i) => (i >= 126 && i <= 725 ? 0 : 4))
    const a = activity({ n, speed })
    a.paused = Uint8Array.from({ length: n }, (_, i) => (i >= 126 && i <= 725 ? 1 : 0))
    const d = digestActivity(a)
    expect(d.distanceBests?.find((b) => b.distanceM === 1000)?.seconds).toBeCloseTo(850, 6)
  })
})

describe('digestActivity: distance bests across unrecorded gaps', () => {
  /** A 4 m/s activity with `missing` seconds from index 500 that no record covers. */
  function withUnrecorded(n: number, speed: Float64Array, missing: [number, number]) {
    const a = activity({ n, speed })
    a.altitude = new Float64Array(n).fill(100)
    a.unrecorded = Uint8Array.from({ length: n }, (_, i) =>
      i >= missing[0] && i < missing[1] ? 1 : 0,
    )
    a.paused = a.unrecorded.slice()
    return a
  }
  const best = (d: ReturnType<typeof digestActivity>, distanceM: number) =>
    d.distanceBests?.find((b) => b.distanceM === distanceM)?.seconds

  it('gives no 10 km best across a 12 s unrecorded gap', () => {
    // 10 km at 4 m/s, with 12 s the device did not record at 1250 s, standing. Distance is held.
    const n = 2513
    const speed = new Float64Array(n).fill(4)
    speed[0] = 0
    for (let i = 1250; i < 1262; i++) speed[i] = 0
    const d = digestActivity(withUnrecorded(n, speed, [1250, 1262]))
    expect(best(d, 10000)).toBeUndefined()
  })

  it('gives no 1 km best across a 60 s unrecorded gap in a 1 km run', () => {
    // 500 m, 60 s unrecorded and standing, then 504 m: the only kilometre spans the gap.
    const n = 312
    const speed = new Float64Array(n).fill(4)
    speed[0] = 0
    for (let i = 126; i <= 185; i++) speed[i] = 0
    const d = digestActivity(withUnrecorded(n, speed, [126, 186]))
    expect(best(d, 1000)).toBeUndefined()
  })

  it('keeps the bests on either side of an unrecorded gap', () => {
    // About 12 km at 4 m/s, with 12 s unrecorded and standing near 5000 m. No 10 km window avoids
    // the gap, but a kilometre and a 5 km window on either side do.
    const n = 3012
    const speed = new Float64Array(n).fill(4)
    speed[0] = 0
    for (let i = 1251; i <= 1262; i++) speed[i] = 0
    const d = digestActivity(withUnrecorded(n, speed, [1251, 1263]))
    expect(best(d, 10000)).toBeUndefined()
    expect(best(d, 1000)).toBeCloseTo(250, 6)
    expect(best(d, 5000)).toBeCloseTo(1250, 6)
  })

  it('still counts a timer-paused gap in elapsed time', () => {
    // Same shape as the untimed 1 km case, but the pause is timed, so it is not unrecorded.
    const n = 851
    const speed = Float64Array.from({ length: n }, (_, i) => (i >= 126 && i <= 725 ? 0 : 4))
    const a = activity({ n, speed })
    a.paused = Uint8Array.from({ length: n }, (_, i) => (i >= 126 && i <= 725 ? 1 : 0))
    a.unrecorded = new Uint8Array(n)
    expect(best(digestActivity(a), 1000)).toBeCloseTo(850, 6)
  })
})

describe('digestActivity: moving time and averages', () => {
  it('counts the moving seconds, leaving out the paused ones', () => {
    const paused = new Uint8Array(60)
    paused.fill(1, 20, 30)
    const d = digestActivity(activity({ n: 60, paused }))
    expect(d.durationS).toBe(60)
    expect(d.movingS).toBe(50)
  })

  it('averages heart rate over the moving seconds only', () => {
    const paused = new Uint8Array(60).fill(1, 0, 10)
    const heartRate = Float64Array.from({ length: 60 }, (_, i) => (i < 10 ? 60 : 150))
    expect(digestActivity(activity({ n: 60, paused, heartRate })).avgHeartRate).toBe(150)
  })

  it('has no average heart rate without a heart-rate stream', () => {
    expect(digestActivity(activity({ n: 60, noHeartRate: true })).avgHeartRate).toBeNull()
  })

  it('averages measured power over the moving seconds, and has none without a power meter', () => {
    const paused = new Uint8Array(60).fill(1, 0, 10)
    const power = Float64Array.from({ length: 60 }, (_, i) => (i < 10 ? 0 : 200))
    expect(digestActivity(climb(60, { power, paused })).avgPowerW).toBe(200)
    expect(digestActivity(climb(60)).avgPowerW).toBeNull()
  })
})

describe('digestActivity: a recording gap is not moving time', () => {
  it('leaves an unrecorded gap out of moving time and out of the averages over it', () => {
    const unrecorded = new Uint8Array(60).fill(0)
    unrecorded.fill(1, 10, 20)
    const heartRate = Float64Array.from({ length: 60 }, (_, i) => (i >= 10 && i < 20 ? 60 : 150))
    const d = digestActivity({ ...activity({ n: 60, heartRate }), unrecorded })
    expect(d.durationS).toBe(60)
    expect(d.movingS).toBe(50)
    expect(d.avgHeartRate).toBe(150)
  })
})
