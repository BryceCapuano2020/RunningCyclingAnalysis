import { describe, expect, it } from 'vitest'
import { DEFAULT_ATHLETE } from '../athlete'
import { generateActivity } from '../generate'
import type { ActivitySpec } from '../spec'
import { NOISE_PRESETS } from './presets'
import type { NoiseModel } from './types'

const M = NOISE_PRESETS.measured

function spec(overrides: Partial<ActivitySpec> = {}): ActivitySpec {
  return {
    id: 't',
    name: 'T',
    sport: 'run',
    startMs: 0,
    durationS: 3000,
    effort: 'easy',
    terrain: 'flat',
    ...overrides,
  }
}

function model(patch: {
  gps?: Partial<NoiseModel['sensor']['gps']>
  hr?: Partial<NoiseModel['sensor']['heartRate']>
  behaviour?: Partial<NoiseModel['behaviour']>
}): NoiseModel {
  return {
    ...M,
    sensor: {
      gps: { ...M.sensor.gps, ...patch.gps },
      heartRate: { ...M.sensor.heartRate, ...patch.hr },
    },
    behaviour: { ...M.behaviour, ...patch.behaviour },
  }
}

const run = (seed: number, noise: NoiseModel, over: Partial<ActivitySpec> = {}) =>
  generateActivity(DEFAULT_ATHLETE, spec(over), seed, noise)

describe('applySensorNoise through generateActivity', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = run(3, M)
    expect(run(3, M).heartRate).toEqual(a.heartRate)
    expect(run(4, M).heartRate).not.toEqual(a.heartRate)
  })

  it('leaves the noise-free output untouched by the optional argument', () => {
    const plain = generateActivity(DEFAULT_ATHLETE, spec(), 9)
    expect(generateActivity(DEFAULT_ATHLETE, spec(), 9, undefined)).toEqual(plain)
    expect(plain.cadence).toBeUndefined()
    expect(plain.indoor).toBe(false)
  })

  it('stops zero the speed, and distance is the running sum of speed', () => {
    const noise = model({ gps: { stops: { max: 4, minS: 20, maxS: 20 } } })
    const stopped = [1, 2, 3, 4, 5, 6].map((s) => run(s, noise).speed.filter((v) => v === 0).length)
    expect(Math.max(...stopped)).toBeGreaterThanOrEqual(20)
    const a = run(2, noise)
    let d = 0
    for (let i = 0; i < a.n; i++) {
      expect(a.distance[i]).toBeCloseTo(d, 6)
      d += a.speed[i]!
    }
  })

  it('keeps stops out of hard efforts', () => {
    const noise = model({ gps: { stops: { max: 4, minS: 20, maxS: 20 } } })
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const a = run(seed, noise, { effort: 'tempo' })
      expect(a.speed.filter((v) => v === 0).length).toBe(0)
    }
  })

  it('wrist lock puts the heart rate on the step rate for a stretch', () => {
    const noise = model({
      hr: { lock: { share: 1, minS: 200, maxS: 200 }, dropouts: { max: 0, minS: 0, maxS: 0 } },
    })
    const a = run(1, noise)
    const near = a.heartRate.filter((h) => Math.abs(h - M.behaviour.stepRate) <= 2).length
    expect(near).toBeGreaterThanOrEqual(199)
  })

  it('dropouts are missing readings no longer than the model allows', () => {
    const noise = model({
      hr: { dropouts: { max: 2, minS: 10, maxS: 10 }, lock: { share: 0, minS: 0, maxS: 0 } },
    })
    const missing = [1, 2, 3, 4, 5, 6].map(
      (s) => run(s, noise).heartRate.filter(Number.isNaN).length,
    )
    expect(Math.max(...missing)).toBeGreaterThan(0)
    expect(Math.max(...missing)).toBeLessThanOrEqual(20)
  })

  it('strap spikes lift single readings far above the run', () => {
    const noise = model({ hr: { spikesPerHour: 36, lock: { share: 0, minS: 0, maxS: 0 } } })
    const a = run(2, noise)
    expect(Math.max(...a.heartRate.filter(Number.isFinite))).toBeGreaterThan(DEFAULT_ATHLETE.hrMax)
  })

  it('cadence is on a run with a stream and absent without; rides never carry it', () => {
    expect(run(1, M).cadenceUnit).toBe('steps/min')
    expect(run(1, model({ behaviour: { cadence: false } })).cadence).toBeUndefined()
    const ride = generateActivity(DEFAULT_ATHLETE, spec({ sport: 'ride' }), 1, M)
    expect(ride.cadence).toBeUndefined()
  })

  it('a treadmill run reports belt speed in 0.1 km/h steps and no altitude', () => {
    const a = run(1, model({ behaviour: { treadmillShare: 1 } }))
    expect(a.indoor).toBe(true)
    expect(a.hasAltitude).toBe(false)
    for (const v of a.speed) {
      const r = (v * 36) % 1 // multiples of 0.1 km/h
      expect(Math.min(r, 1 - r)).toBeLessThan(1e-6)
    }
  })

  it('hard efforts read with the per-effort spread; the quiet preset keeps them to the capability', () => {
    const best = (noise: NoiseModel, seed: number) => {
      const a = generateActivity(
        DEFAULT_ATHLETE,
        spec({ sport: 'ride', effort: 'tempo', durationS: 2400, terrain: 'flat' }),
        seed,
        noise,
      )
      let sum = 0
      for (let i = 600; i < 2100; i++) sum += a.power[i]!
      return sum / 1500
    }
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8]
    const spread = (noise: NoiseModel) => {
      const xs = seeds.map((s) => best(noise, s))
      const m = xs.reduce((s, x) => s + x, 0) / xs.length
      return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length) / m
    }
    expect(spread(NOISE_PRESETS.quiet)).toBeLessThan(0.03)
    expect(spread(M)).toBeGreaterThan(0.08)
  })

  it('rolling terrain is not periodic: altitude differs from the two-sine profile of the clean run', () => {
    const rolling = spec({ terrain: 'rolling', durationS: 3600 })
    const clean = generateActivity(DEFAULT_ATHLETE, rolling, 1)
    const noisy = generateActivity(DEFAULT_ATHLETE, rolling, 1, NOISE_PRESETS.quiet)
    expect(noisy.altitude).not.toEqual(clean.altitude)
    const rise = Math.max(...noisy.altitude) - Math.min(...noisy.altitude)
    expect(rise).toBeGreaterThan(5)
    expect(rise).toBeLessThan(400)
  })
})
