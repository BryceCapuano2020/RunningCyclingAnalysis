import { criticalPowerOutcome, shortBestsFit, unevenFit, wPrimeFloor } from '../cp'
import type { CriticalPowerOutcome, UnevenFit } from '../cp'
import type { EffortGate } from '../effort'
import type { Curve, Sport } from '../types'
import { gatedThreshold } from './effortGating'
import type { GatedThreshold } from './effortGating'

/** Each sport's threshold fit and the fit without its uneven bests, before the effort gate has its say. */
export interface ThresholdFits {
  outcome: Record<Sport, CriticalPowerOutcome>
  uneven: Record<Sport, UnevenFit | null>
}

/**
 * The critical-power fit of each sport's best curve (the ride's as gross metabolic W/kg) and the fit without the uneven
 * bests that set only a floor on it. Heart rate tracks metabolic power linearly only while the effort is aerobic, so the
 * analysis cuts its heart-rate blocks by the fit before refusal, which is what `outcome.fit` is.
 */
export function thresholdFits(
  runCurve: Curve,
  rideMetabolic: Curve,
  massKg: number,
): ThresholdFits {
  const run = criticalPowerOutcome(runCurve, { minWPrime: wPrimeFloor('run', massKg) })
  const ride = criticalPowerOutcome(rideMetabolic, { minWPrime: wPrimeFloor('ride', massKg) })
  return {
    outcome: { run, ride },
    uneven: {
      run: unevenFit(runCurve, wPrimeFloor('run', massKg), run.fit),
      ride: unevenFit(rideMetabolic, wPrimeFloor('ride', massKg), ride.fit),
    },
  }
}

/** Each sport's threshold as the analysis reports it, once the effort gate has had its say. */
export function gatedThresholds(
  gate: Record<Sport, EffortGate>,
  fits: ThresholdFits,
  runCurve: Curve,
  rideMetabolic: Curve,
  massKg: number,
): Record<Sport, GatedThreshold> {
  return {
    run: gatedThreshold(
      gate.run,
      fits.outcome.run,
      fits.uneven.run,
      shortBestsFit(runCurve, wPrimeFloor('run', massKg)),
    ),
    ride: gatedThreshold(
      gate.ride,
      fits.outcome.ride,
      fits.uneven.ride,
      shortBestsFit(rideMetabolic, wPrimeFloor('ride', massKg)),
    ),
  }
}
