import { describe, expect, it } from 'vitest'
import { simulate } from '../../fitness/test/runSim'
import { mulberry32, quantile } from '../../math'
import type { Activity } from '../../types'
import { DEFAULT_ATHLETE } from '../athlete'
import { generateActivity } from '../generate'
import { weeklyLevel } from './level'
import { NOISE_PRESETS, NOISE_PRESET_NAMES } from './presets'
import type { NoisePresetName } from './presets'
import { studentT5 } from './random'
import {
  SPLIT_HALF_EFFORTS,
  autocorrelation,
  quantileRange,
  sineShare,
  splitHalfMedian,
} from './realism'

/** Guard bands: split-half spread of equal-capability bests (6 efforts a half). A change that moves one fails here. */
const QUIET_BAND = { run: [0.004, 0.009], ride: [0.004, 0.009] }
const REAL_BAND = { run: [0.04, 0.05], ride: [0.12, 0.13] }
const SPLIT_HALF = (name: NoisePresetName) => (name === 'quiet' ? QUIET_BAND : REAL_BAND)
/** Mean over 30 libraries of the spread of the weekly level over five years, log units. */
const LEVEL_SD: Record<NoisePresetName, [number, number]> = {
  quiet: [0, 0],
  measured: [0.018, 0.022],
  nuisanceAll: [0.037, 0.043],
  phoneGps: [0.018, 0.022],
  strapStep: [0.024, 0.03],
}

const NINETY_SEVEN_MIN_S = 5820
const SEEDS = [1, 2, 3, 4, 5, 6]

function easyRun(seed: number, noise?: (typeof NOISE_PRESETS)[NoisePresetName]): Activity {
  return generateActivity(
    DEFAULT_ATHLETE,
    {
      id: 'e',
      name: 'Easy',
      sport: 'run',
      startMs: 0,
      durationS: NINETY_SEVEN_MIN_S,
      effort: 'easy',
      terrain: 'flat',
    },
    seed,
    noise,
  )
}

const meanOf = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length

describe('noise presets', () => {
  it.each(NOISE_PRESET_NAMES)('%s: split-half spread of equal-capability bests', (name) => {
    const b = NOISE_PRESETS[name].behaviour
    const { run, ride } = SPLIT_HALF(name)
    const [runMedian, rideMedian] = [splitHalfMedian(b, 'run'), splitHalfMedian(b, 'ride')]
    expect(runMedian).toBeGreaterThanOrEqual(run[0]!)
    expect(runMedian).toBeLessThanOrEqual(run[1]!)
    expect(rideMedian).toBeGreaterThanOrEqual(ride[0]!)
    expect(rideMedian).toBeLessThanOrEqual(ride[1]!)
  })

  // The same statistic from real generated activities: a 20-minute run best and a 5-minute ride
  // best (each a held test window), 6 against 6 drawn (with replacement) from a pool of 1000 equal-capability activities.
  it.each([
    { sport: 'run', durationS: 5200, from: 3960, to: 5160, band: [0.04, 0.06] },
    { sport: 'ride', durationS: 2100, from: 1680, to: 2040, band: [0.115, 0.14] },
  ] as const)(
    'generated $sport bests show the split-half spread',
    ({ sport, durationS, from, to, band }) => {
      const m = NOISE_PRESETS.measured
      const bests = Array.from({ length: 1000 }, (_, k) => {
        const a = generateActivity(
          DEFAULT_ATHLETE,
          { id: 'b', name: 'B', sport, startMs: 0, durationS, effort: 'test', terrain: 'flat' },
          (k + 1) * 7919 + 13,
          m,
        )
        const xs = sport === 'run' ? a.speed : a.power
        let sum = 0
        for (let i = from; i < to; i++) sum += xs[i]!
        return sum / (to - from)
      })
      const rand = mulberry32(11)
      const diffs = Array.from({ length: 3000 }, () => {
        const half = () => {
          let top = 0
          for (let k = 0; k < SPLIT_HALF_EFFORTS; k++) {
            top = Math.max(top, bests[Math.floor(rand() * bests.length)]!)
          }
          return top
        }
        return Math.abs(Math.log(half() / half()))
      })
      // A finite pool adds about half a point of sampling noise to the median, hence the upper edges.
      const median = quantile(diffs, 0.5)
      expect(median).toBeGreaterThanOrEqual(band[0])
      expect(median).toBeLessThanOrEqual(band[1])
    },
  )

  it.each(NOISE_PRESET_NAMES)('%s: spread of the weekly level', (name) => {
    const sds = Array.from({ length: 30 }, (_, k) => {
      const lv = weeklyLevel(NOISE_PRESETS[name].level, 260, mulberry32(k + 1))
      return Math.sqrt(meanOf(Array.from(lv, (x) => x * x)))
    })
    const [lo, hi] = LEVEL_SD[name]
    expect(meanOf(sds)).toBeGreaterThanOrEqual(lo)
    expect(meanOf(sds)).toBeLessThanOrEqual(hi)
  })

  it('the run spread draw has unit variance', () => {
    const rand = mulberry32(5)
    const xs = Array.from({ length: 40000 }, () => studentT5(rand))
    expect(Math.sqrt(meanOf(xs.map((x) => x * x)))).toBeGreaterThan(0.97)
    expect(Math.sqrt(meanOf(xs.map((x) => x * x)))).toBeLessThan(1.03)
  })

  it('weeklyLevel makes the draws runSim makes: same seed, same weekly level', () => {
    const level = NOISE_PRESETS.nuisanceAll.level
    const weeks = 200
    const levels = weeklyLevel(level, weeks, mulberry32(4 * 7919 + 13))
    const points = simulate(
      {
        weeks,
        perWeek: 1,
        runSd: 0,
        wanderSd: level.wanderSd,
        wanderRho: level.wanderRho,
        seasonal: level.seasonAmp,
        heat: level.heatDrop,
        strap: level.strapStep,
      },
      4,
    )
    expect(points.length).toBeGreaterThan(100)
    for (const p of points) {
      const week = Number(p.id.split('-')[1])
      expect(p.x).toBeCloseTo(levels[week]!, 12)
    }
  })
})

describe('easy runs read like a device, not two sines', () => {
  // The noise-free generator fails each of these on purpose: it is what the audit measured.
  const stats = (noise?: (typeof NOISE_PRESETS)[NoisePresetName]) =>
    SEEDS.map((s) => {
      const a = easyRun(s, noise)
      return {
        hrRange: quantileRange(a.heartRate, 0.05, 0.95),
        lag600: autocorrelation(a.speed, 600),
        sines: sineShare(a.speed, [600, 1700]),
      }
    })

  it('the noise-free run is the sinusoid the audit found', () => {
    const clean = stats()
    expect(
      quantile(
        clean.map((c) => c.hrRange),
        0.5,
      ),
    ).toBeLessThan(12)
    expect(
      quantile(
        clean.map((c) => c.lag600),
        0.5,
      ),
    ).toBeGreaterThan(0.3)
    expect(
      quantile(
        clean.map((c) => c.sines),
        0.5,
      ),
    ).toBeGreaterThan(0.8)
  })

  it.each(NOISE_PRESET_NAMES)('%s: pace is not periodic', (name) => {
    for (const c of stats(NOISE_PRESETS[name])) {
      expect(c.lag600).toBeLessThan(0.3)
      expect(c.sines).toBeLessThan(0.8)
    }
  })

  it.each(['measured', 'nuisanceAll', 'phoneGps', 'strapStep'] as const)(
    '%s: heart rate spans at least 12 bpm (5th to 95th) over 97 minutes',
    (name) => {
      for (const c of stats(NOISE_PRESETS[name])) expect(c.hrRange).toBeGreaterThanOrEqual(12)
    },
  )
})
