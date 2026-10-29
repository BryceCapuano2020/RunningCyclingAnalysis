import type { PowerTerms } from '../types'

/** The parts of an ActivityDigest that are lists of small records. They are re-exported from types.ts. */

export interface DigestCurvePoint {
  durationS: number
  /**
   * Runs: best gross metabolic W/kg at the prior-mean economy. Rides with a power
   * meter: best measured mechanical W. Rides without: NaN here, see `terms`.
   */
  value: number
  startIndex: number
  /** Length of the window this value really came from (>= durationS after the monotone envelope). */
  windowS: number
  /** Mean valid heart rate over that window, or null. */
  heartRate: number | null
  /** Virtual-power rides only: power terms of the chosen climb window. */
  terms: PowerTerms | null
}

export interface DigestHrBlock {
  heartRate: number
  /** Runs: mean gross metabolic W/kg. Rides with power: mean measured W. Otherwise NaN. */
  value: number
  /** Virtual-power rides only. */
  terms: PowerTerms | null
}

/** A run's fastest elapsed time over one record distance. Wall clock, so pauses inside it count. */
export interface DigestDistanceBest {
  distanceM: number
  seconds: number
}

export interface DigestClimbSection {
  start: number
  end: number
  measuredW: number
  terms: PowerTerms
}
