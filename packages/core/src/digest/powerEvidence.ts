import { pointOverCeiling } from '../curves'
import type { EffortReference } from '../effort'
import type { ActivityDigest } from '../types'

/**
 * What the heart rate says about a ride whose power is in question (see implausiblePower). A power meter cannot be
 * checked against heart rate to the watt, but an effort held at a power no rider holds is, if the power is right, a
 * very hard one, and the heart rate over it shows how hard the body found it. It is told as a fact beside the power, not as a
 * verdict: heart rate cannot say the power was right, and a high one does not make it so.
 */
export interface PowerHeartRate {
  /** The length of the effort read, s: the longest one over the ceiling that is long enough for heart rate to follow. */
  durationS: number
  /** Its measured power per kilo, W/kg. */
  wkg: number
  /** The mean heart rate over it, as a share of the sport's reference heart rate. */
  heartRateShare: number
}

/** Efforts shorter than this, s, are not read: heart rate lags power by about a minute, so a sprint's says nothing. */
export const POWER_HEART_RATE_MIN_S = 300

/** The reference heart rate for rides when it can be trusted to stand for a maximum, else null. */
export function rideReferenceOf(reference: EffortReference): number | null {
  return reference.reading.ride === 'trusted' ? reference.referenceHr.ride : null
}

/**
 * The heart rate over the longest effort of at least POWER_HEART_RATE_MIN_S that is over the ceiling, or undefined
 * when none is, when it has no heart rate, or without a reference to read it against.
 */
export function powerHeartRateOf(
  digest: Pick<ActivityDigest, 'curve'>,
  bodyKg: number,
  referenceHr: number | null,
): PowerHeartRate | undefined {
  if (referenceHr === null || !(referenceHr > 0)) return undefined
  let found: PowerHeartRate | undefined
  for (const point of digest.curve) {
    if (point.heartRate === null || point.durationS < POWER_HEART_RATE_MIN_S) continue
    if (!pointOverCeiling(point, bodyKg)) continue
    const wkg = point.value / bodyKg
    if (found === undefined || point.durationS > found.durationS) {
      found = { durationS: point.durationS, wkg, heartRateShare: point.heartRate / referenceHr }
    }
  }
  return found
}
