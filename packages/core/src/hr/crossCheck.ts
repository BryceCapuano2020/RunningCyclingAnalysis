import { HR_MODEL_DISCREPANCY } from '../constants'
import type { HrCrossCheck, HrPoint } from '../types'
import { fitHr } from './fit'

type SportFit = NonNullable<HrCrossCheck['run']>

function fitSport(points: HrPoint[]): SportFit | null {
  const fit = fitHr(points)
  return fit === null ? null : { points, fit }
}

/**
 * Compares the heart-rate slope of riding with that of running. kappa above 1 means riding costs
 * more metabolic power than the priors assume, relative to running.
 */
export function crossCheck(runPoints: HrPoint[], ridePoints: HrPoint[]): HrCrossCheck {
  const run = fitSport(runPoints)
  const ride = fitSport(ridePoints)
  if (run === null || ride === null) return { run, ride, kappa: null, lnKappaSe: null }
  const kappa = ride.fit.slope / run.fit.slope
  const runRel = run.fit.slopeSe / run.fit.slope
  const rideRel = ride.fit.slopeSe / ride.fit.slope
  const lnKappaSe = Math.sqrt(
    runRel * runRel + rideRel * rideRel + HR_MODEL_DISCREPANCY * HR_MODEL_DISCREPANCY,
  )
  return { run, ride, kappa, lnKappaSe }
}
