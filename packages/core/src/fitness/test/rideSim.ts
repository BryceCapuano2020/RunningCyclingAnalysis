import { DAY_MS } from '../../constants'
import { MONDAY, weeksOf } from '../../digest/test/sameHeartRateFixture'
import { mulberry32, normal } from '../../math'
import { NOISE_PRESETS } from '../../synthetic/noise/presets'
import type { ActivityDigest } from '../../types'

const WEEK_MS = 7 * DAY_MS

/** The athlete's weekly wander and season, shared with the run sims (`NOISE_PRESETS.measured`). */
const LEVEL = NOISE_PRESETS.measured.level
const WANDER_RHO = LEVEL.wanderRho

export interface RideSpec {
  weeks: number
  /** Measured-power rides a week: 1, 2, 3, 4 or 8 (the fixture's day tables). */
  perWeek: 1 | 2 | 3 | 4 | 8
  seed: number
  /** The spread of one ride's day (log), shared by all its blocks. */
  rideSd: number
  /** The spread of one five-minute block against the next (log): the meter, coasting, wind, the effort not being steady. */
  blockSd: number
  /** Slow wander of the athlete's level: the sd of an AR(1) with the measured weekly correlation. Default the measured 2%. */
  wanderSd?: number
  seasonal?: number
  /** The planted change in the level (log) in a week. */
  planted?: (week: number) => number
}

/**
 * A library of rides with a power meter, as digests: five five-minute blocks at 125 to 165 bpm each, power rising 0.7% a bpm,
 * with the noise of a ride's day, of each block, and a slow wander. The level is the athlete's, which the unit reads back
 * at the library's reference heart rate. Deterministic.
 */
export function rideLibrary(spec: RideSpec): ActivityDigest[] {
  const random = mulberry32(spec.seed * 7919 + 17)
  const wander: number[] = []
  let a = 0
  for (let w = 0; w < spec.weeks; w++) {
    a = WANDER_RHO * a + Math.sqrt(1 - WANDER_RHO ** 2) * normal(random)
    wander.push((spec.wanderSd ?? LEVEL.wanderSd) * a)
  }
  const level = (startMs: number) => {
    const w = Math.max(0, Math.min(spec.weeks - 1, Math.floor((startMs - MONDAY) / WEEK_MS)))
    const season = spec.seasonal ? spec.seasonal * Math.sin((2 * Math.PI * (w + 10)) / 52) : 0
    return Math.exp(wander[w]! + season + (spec.planted?.(w) ?? 0))
  }
  return weeksOf(
    'ride',
    spec.weeks,
    level,
    () => Math.exp(spec.blockSd * normal(random)),
    spec.perWeek,
    () => Math.exp(spec.rideSd * normal(random)),
  )
}
