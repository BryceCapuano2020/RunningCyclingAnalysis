import { describe, expect, it } from 'vitest'
import { DRIVETRAIN_EFFICIENCY, FLAT_RUN_COST, G, RESTING_W_PER_KG, RHO_AIR } from '../constants'
import { mean } from '../math'
import { DEFAULT_ATHLETE } from './athlete'
import type { SyntheticAthlete } from './athlete'
import { generateActivity } from './generate'
import type { ActivitySpec } from './spec'

const A = DEFAULT_ATHLETE

function spec(overrides: Partial<ActivitySpec> = {}): ActivitySpec {
  return {
    id: 'test',
    name: 'Test',
    sport: 'run',
    startMs: 0,
    durationS: 1200,
    effort: 'easy',
    terrain: 'flat',
    ...overrides,
  }
}

/** Best mean over any window of `window` samples. Caller guarantees no NaN. */
function bestMean(xs: Float64Array, window: number): number {
  let sum = 0
  for (let i = 0; i < window; i++) sum += xs[i]!
  let best = sum
  for (let i = window; i < xs.length; i++) {
    sum += xs[i]! - xs[i - window]!
    best = Math.max(best, sum)
  }
  return best / window
}

/** Steady speed on the flat where mechanical power balances rolling and aero drag. */
function flatSteadySpeed(powerW: number, athlete: SyntheticAthlete): number {
  const mass = athlete.massKg + athlete.bikeMassKg
  const available = powerW * DRIVETRAIN_EFFICIENCY
  const balance = (v: number) =>
    v * (mass * G * athlete.crr + 0.5 * RHO_AIR * athlete.cda * v * v) - available
  let lo = 1
  let hi = 25
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2
    if (balance(mid) > 0) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}

describe('generateActivity', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const s = spec({ sport: 'ride', terrain: 'rolling', effort: 'tempo', durationS: 600 })
    const a = generateActivity(A, s, 7)
    const b = generateActivity(A, s, 7)
    const c = generateActivity(A, s, 8)
    expect(b.speed).toEqual(a.speed)
    expect(b.distance).toEqual(a.distance)
    expect(b.heartRate).toEqual(a.heartRate)
    expect(b.power).toEqual(a.power)
    expect(c.speed).not.toEqual(a.speed)
    expect(c.heartRate).not.toEqual(a.heartRate)
  })

  it('sets stream lengths to the spec duration and the has flags', () => {
    const run = generateActivity(A, spec({ durationS: 300 }), 1)
    expect(run.n).toBe(300)
    for (const stream of [run.speed, run.distance, run.altitude, run.heartRate, run.power]) {
      expect(stream.length).toBe(300)
    }
    expect(run.hasPower).toBe(false)
    expect(run.power.every(Number.isNaN)).toBe(true)
    expect(run.hasHeartRate).toBe(true)
    expect(run.heartRate.some(Number.isNaN)).toBe(false)
    expect(run.hasAltitude).toBe(true)
    expect(run.id).toBe('test')
    expect(run.sport).toBe('run')
  })

  it('records no power and no heart rate when both are switched off on a ride', () => {
    const ride = generateActivity(
      A,
      spec({ sport: 'ride', withPower: false, withHeartRate: false, durationS: 600 }),
      2,
    )
    expect(ride.hasPower).toBe(false)
    expect(ride.power.every(Number.isNaN)).toBe(true)
    expect(ride.hasHeartRate).toBe(false)
    expect(ride.heartRate.every(Number.isNaN)).toBe(true)
  })

  it('records power on a ride by default', () => {
    const ride = generateActivity(A, spec({ sport: 'ride', durationS: 600 }), 2)
    expect(ride.hasPower).toBe(true)
    expect(ride.power.some(Number.isNaN)).toBe(false)
    expect(ride.power.every((p) => Number.isInteger(p))).toBe(true)
  })

  it('keeps distance non-decreasing and starts it at zero', () => {
    const rolling = generateActivity(
      A,
      spec({ sport: 'ride', terrain: 'rolling', effort: 'intervals', durationS: 1800 }),
      3,
    )
    const climb = generateActivity(A, spec({ terrain: 'climb', durationS: 1800 }), 4)
    for (const act of [rolling, climb]) {
      expect(act.distance[0]).toBe(0)
      for (let i = 1; i < act.n; i++) {
        expect(act.distance[i]!).toBeGreaterThanOrEqual(act.distance[i - 1]!)
      }
    }
  })

  it('a flat easy run has mean speed matching the Minetti formula within 2%', () => {
    const act = generateActivity(A, spec({ durationS: 2700 }), 11)
    const expected = (0.65 * A.cpRun - RESTING_W_PER_KG) / (A.runEconomyScale * FLAT_RUN_COST)
    expect(expected).toBeCloseTo(2.5634, 3)
    expect(Math.abs(mean(act.speed) / expected - 1)).toBeLessThan(0.02)
  })

  it('a test ride best 3/6/12/20-min power matches the true critical power curve', () => {
    const act = generateActivity(A, spec({ sport: 'ride', effort: 'test', durationS: 6600 }), 21)
    const scale = A.grossEfficiency * A.massKg
    for (const seconds of [180, 360, 720, 1200]) {
      const expected = (A.cpRide + A.wPrime / seconds) * scale
      const measured = bestMean(act.power, seconds)
      expect(Math.abs(measured / expected - 1)).toBeLessThan(0.01)
    }
  })

  it('a test ride with a short duration only includes the efforts that fit', () => {
    const act = generateActivity(A, spec({ sport: 'ride', effort: 'test', durationS: 1500 }), 5)
    const expected = 0.55 * A.cpRide * A.grossEfficiency * A.massKg
    expect(Math.abs(mean(act.power.subarray(1200, 1500)) / expected - 1)).toBeLessThan(0.02)
  })

  it('tempo heart rate in the steady part matches intercept + slope * 0.88 cp within 3 bpm', () => {
    const act = generateActivity(A, spec({ effort: 'tempo', durationS: 1800 }), 31)
    const expected = A.hrIntercept + A.hrSlope * 0.88 * A.cpRun
    expect(Math.abs(mean(act.heartRate.subarray(720, 1200)) - expected)).toBeLessThan(3)
  })

  it('flat ride speed at steady tempo power matches the closed-form power balance within 3%', () => {
    const act = generateActivity(A, spec({ sport: 'ride', effort: 'tempo', durationS: 1800 }), 41)
    const power = 0.88 * A.cpRide * A.grossEfficiency * A.massKg
    const expected = flatSteadySpeed(power, A)
    expect(Math.abs(mean(act.speed.subarray(1200, 1500)) / expected - 1)).toBeLessThan(0.03)
  })

  it('heart rate reads 100 to 105 bpm in the glitch stretch and normally elsewhere', () => {
    const act = generateActivity(
      A,
      spec({ sport: 'ride', effort: 'tempo', terrain: 'rolling', durationS: 5400, hrGlitch: true }),
      51,
    )
    const start = Math.floor(0.4 * act.n)
    for (let i = start; i < start + 360; i++) {
      expect(act.heartRate[i]!).toBeGreaterThanOrEqual(100)
      expect(act.heartRate[i]!).toBeLessThanOrEqual(105)
    }
    let outsideMax = 0
    for (let i = 0; i < start; i++) outsideMax = Math.max(outsideMax, act.heartRate[i]!)
    expect(outsideMax).toBeGreaterThan(105)
  })

  it('a sustained coast pulls heart rate down to the resting metabolic rate', () => {
    // Test-only athlete strong enough that the rider coasts for the whole descent.
    const strong: SyntheticAthlete = { ...A, cpRide: 400 }
    const act = generateActivity(
      strong,
      spec({ sport: 'ride', effort: 'tempo', terrain: 'climb', durationS: 3600 }),
      62,
    )
    const descentStart = Math.floor(0.6 * act.n)
    // Steady tempo block on the descent runs until 5 min before the end.
    const coastEnd = act.n - 300
    for (let i = descentStart + 300; i < coastEnd; i++) expect(act.power[i]).toBe(0)
    const restingHr = A.hrIntercept + A.hrSlope * RESTING_W_PER_KG
    expect(mean(act.heartRate.subarray(descentStart + 600, coastEnd))).toBeLessThan(restingHr + 5)
    expect(act.heartRate[descentStart - 1]!).toBeGreaterThan(300)
  })

  it('coasts on a steep descent that would exceed 18 m/s', () => {
    const strong: SyntheticAthlete = { ...A, cpRide: 40 }
    const act = generateActivity(
      strong,
      spec({ sport: 'ride', effort: 'intervals', terrain: 'climb', durationS: 3600 }),
      61,
    )
    const zeros: number[] = []
    for (let i = 0; i < act.n; i++) if (act.power[i] === 0) zeros.push(i)
    expect(zeros.length).toBeGreaterThan(0)
    expect(zeros[0]!).toBeGreaterThanOrEqual(Math.floor(0.6 * act.n))
    expect(Math.max(...act.speed)).toBeLessThan(19)
  })

  it('climbs for 5 minutes then to 60% of the activity, then descends', () => {
    const act = generateActivity(
      A,
      spec({ sport: 'ride', effort: 'tempo', terrain: 'climb', durationS: 4800 }),
      71,
    )
    const peak = act.altitude[Math.floor(0.6 * act.n)]!
    expect(peak).toBeGreaterThan(300)
    expect(act.altitude[act.n - 1]!).toBeLessThan(peak)
    expect(act.altitude[0]).toBe(200)
  })

  it('altitude is recorded in 0.2 m steps', () => {
    const act = generateActivity(A, spec({ terrain: 'rolling', durationS: 600 }), 81)
    for (const alt of act.altitude) {
      expect(Math.abs(alt * 5 - Math.round(alt * 5))).toBeLessThan(1e-9)
    }
  })

  it('caps run speed at 7.5 m/s and never reports negative speed', () => {
    const fast: SyntheticAthlete = { ...A, cpRun: 60 }
    const act = generateActivity(fast, spec({ effort: 'test', durationS: 1200 }), 91)
    expect(Math.max(...act.speed)).toBeLessThanOrEqual(7.5 * 1.01 + 1e-9)
    const slow = generateActivity(
      A,
      spec({ effort: 'easy', terrain: 'climb', durationS: 1200 }),
      92,
    )
    expect(Math.min(...slow.speed)).toBeGreaterThanOrEqual(0)
  })
})
