import { criticalPowerOutcome, unevenFit, wPrimeFloor } from '../cp'
import type { UnevenFit } from '../cp'
import type { CriticalPowerFit, CriticalPowerRefusal, Curve, Sport } from '../types'

/** A sport's critical-power fit as the analysis reports it. */
export interface ReportedFit {
  fit: CriticalPowerFit | null
  refusal: CriticalPowerRefusal | null
  /** The fit without the uneven bests, which set only a floor on it; null without one. See cp/uneven. */
  uneven: UnevenFit | null
}

/**
 * The critical-power fit of each sport's best curve (the ride's as gross metabolic W/kg) and the fit without the uneven
 * bests. The effort gate has no say in it: whether the best 20 minutes was a hard effort is a label beside the fit, and
 * the ride threshold the headline reads (`rideThreshold`) takes heart rate as a hint, never a veto.
 */
export function thresholdFits(
  runCurve: Curve,
  rideMetabolic: Curve,
  massKg: number,
): Record<Sport, ReportedFit> {
  const one = (curve: Curve, sport: Sport): ReportedFit => {
    const minWPrime = wPrimeFloor(sport, massKg)
    const { fit, refusal } = criticalPowerOutcome(curve, { minWPrime })
    return { fit, refusal, uneven: unevenFit(curve, minWPrime, fit) }
  }
  return { run: one(runCurve, 'run'), ride: one(rideMetabolic, 'ride') }
}
