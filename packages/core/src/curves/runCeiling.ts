import { PRIORS, RUN_WORLD_RECORD_SPEEDS } from '../constants'
import { metabolicToFlatSpeed } from '../metabolic'

/**
 * The fastest flat running speed, m/s, that a best of durationS can be. Between two entries of the
 * world-record table the ceiling is a straight line in log duration and log speed; beyond its ends it
 * holds the end value.
 */
export function runCeilingSpeed(durationS: number): number {
  const first = RUN_WORLD_RECORD_SPEEDS[0]!
  const last = RUN_WORLD_RECORD_SPEEDS.at(-1)!
  if (durationS <= first.durationS) return first.speedMs
  if (durationS >= last.durationS) return last.speedMs
  const hiIndex = RUN_WORLD_RECORD_SPEEDS.findIndex((entry) => entry.durationS >= durationS)
  const lo = RUN_WORLD_RECORD_SPEEDS[hiIndex - 1]!
  const hi = RUN_WORLD_RECORD_SPEEDS[hiIndex]!
  if (hi.durationS === durationS) return hi.speedMs
  const share =
    (Math.log(durationS) - Math.log(lo.durationS)) /
    (Math.log(hi.durationS) - Math.log(lo.durationS))
  return Math.exp(Math.log(lo.speedMs) + share * (Math.log(hi.speedMs) - Math.log(lo.speedMs)))
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
