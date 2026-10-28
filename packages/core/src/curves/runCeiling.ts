import { PRIORS, RUN_WORLD_RECORD_SPEEDS } from '../constants'
import { metabolicToFlatSpeed } from '../metabolic'
import { interpolatedCeiling } from './speedCeiling'

// Every run curve point and heart-rate block of a library is checked against the ceiling of one of the
// few durations the digests use, so each ceiling is worked out once. A few more than they use are kept.
const ceilings = new Map<number, number>()
const MAX_REMEMBERED = 64

/**
 * The fastest flat running speed, m/s, that a best of durationS can be. Between two entries of the
 * world-record table the ceiling is a straight line in log duration and log speed; beyond its ends it
 * holds the end value.
 */
export function runCeilingSpeed(durationS: number): number {
  let speed = ceilings.get(durationS)
  if (speed === undefined) {
    speed = interpolatedCeiling(RUN_WORLD_RECORD_SPEEDS, durationS)
    if (ceilings.size < MAX_REMEMBERED) ceilings.set(durationS, speed)
  }
  return speed
}

/**
 * A run's gross metabolic W/kg for a duration, or NaN when its flat speed is above the ceiling for
 * that duration. Such a point is not a possible effort, so it counts for nothing, and a lower point
 * from another activity takes its place.
 */
export function possibleRunWkg(durationS: number, metabolicWkg: number): number {
  const speed = metabolicToFlatSpeed(metabolicWkg, PRIORS.runEconomyScale.mean)
  return speed > runCeilingSpeed(durationS) ? Number.NaN : metabolicWkg
}
