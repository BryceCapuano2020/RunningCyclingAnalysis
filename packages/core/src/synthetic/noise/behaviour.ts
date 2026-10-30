import { RESTING_W_PER_KG } from '../../constants'
import { normal } from '../../math'
import type { Sport } from '../../types'
import type { Effort } from '../spec'
import { rawTarget } from '../target'
import { ar1, between, valueNoise } from './random'
import type { BehaviourNoise } from './types'

/** Hard samples are those at or above this share of critical effort. */
const HARD_SHARE = 0.85
/** Delivered efforts are cut off at this many sd of the log factor (mean plus 3 sd). */
const DELIVERED_SD_CAP = 3
/** Easy-effort wander: slow drift, a few minutes, and short surges. Autocorrelation fades by 10 min. */
const EASY_WANDER = [
  { sd: 0.01, corrS: 1800 },
  { sd: 0.02, corrS: 300 },
  { sd: 0.03, corrS: 40 },
]
/** Rolling terrain octaves: wavelength in metres and grade amplitude. */
const TERRAIN_OCTAVES = [
  { wavelengthM: 2500, amplitude: 0.012 },
  { wavelengthM: 900, amplitude: 0.012 },
  { wavelengthM: 300, amplitude: 0.01 },
  { wavelengthM: 100, amplitude: 0.008 },
]

/**
 * What one hard effort delivers against the athlete's capability: log-normal, cut off at 3 sd. The
 * generator and the realism statistic (realism.ts) both draw through this, so a library's bests
 * show the split-half spread the preset claims.
 */
export function deliveredFactor(rand: () => number, b: BehaviourNoise, sport: Sport): number {
  const sd = b.effortSd[sport]
  const z = Math.min(DELIVERED_SD_CAP, Math.max(-DELIVERED_SD_CAP, normal(rand)))
  return Math.exp(sd * z)
}

/**
 * Raw metabolic target (W/kg) with the athlete's behaviour. Easy efforts sit at a drawn fraction of
 * critical effort and wander at several scales instead of two sines. Hard efforts keep the
 * noise-free shape, scaled by one effort factor and a fade over the activity.
 */
export function behaviourTarget(
  effort: Effort,
  sport: Sport,
  cp: number,
  wPrime: number,
  n: number,
  rand: () => number,
  b: BehaviourNoise,
): Float64Array {
  if (effort === 'easy') {
    const { min, max } = b.easyFraction[sport]
    const level = RESTING_W_PER_KG + between(rand, min, max) * (cp - RESTING_W_PER_KG)
    const out = new Float64Array(n).fill(level)
    for (const { sd, corrS } of EASY_WANDER) {
      const w = ar1(n, rand, sd, corrS)
      for (let i = 0; i < n; i++) out[i]! *= 1 + w[i]!
    }
    return out
  }
  const out = rawTarget(effort, cp, wPrime, n, rand)
  const factor = deliveredFactor(rand, b, sport)
  const fade = rand() * b.fade
  for (let i = 0; i < n; i++) {
    if (out[i]! >= HARD_SHARE * cp) out[i]! *= factor * (1 - (fade * i) / n)
  }
  return out
}

/** Rolling grade as multi-octave value noise over distance, in place of two sines. */
export function roughGrade(rand: () => number): (distance: number) => number {
  const octaves = TERRAIN_OCTAVES.map((o) => ({
    f: valueNoise(rand, o.wavelengthM),
    a: o.amplitude,
  }))
  return (distance) => octaves.reduce((sum, o) => sum + o.a * o.f(distance), 0)
}
