import { crossCheck } from '../hr'
import type {
  ActivityDigest,
  BikeModel,
  CriticalPowerFit,
  HrCrossCheck,
  HrPoint,
  Sport,
} from '../types'
import type { Masses } from './masses'
import { heartRatePoints } from './rideCurves'

/**
 * Heart-rate points at or below critical power. Heart rate is only regressed where it still rises
 * with power. Without a fit, every point is kept.
 */
export function atOrBelowCriticalPower(points: HrPoint[], cp: CriticalPowerFit | null): HrPoint[] {
  if (cp === null) return points
  return points.filter((p) => p.metabolicPower <= cp.cp)
}

/**
 * The run-versus-ride heart-rate check of these trusted digests: the heart rate of each sport's blocks
 * against its metabolic power, kept to the blocks at or below that sport's critical power (the unchecked
 * fit, so a threshold refused for display leaves the check as it was). The analysis of a period takes it
 * over the period's digests; the library's judgement takes it over every visible one, which is the
 * calibration every period's equivalents and comparison read.
 */
export function heartRateCrossCheck(
  trusted: ActivityDigest[],
  masses: Masses,
  bikeModel: BikeModel,
  fits: Record<Sport, CriticalPowerFit | null>,
): HrCrossCheck {
  const { runPoints, ridePoints } = heartRatePoints(trusted, masses, bikeModel)
  return crossCheck(
    atOrBelowCriticalPower(runPoints, fits.run),
    atOrBelowCriticalPower(ridePoints, fits.ride),
  )
}
