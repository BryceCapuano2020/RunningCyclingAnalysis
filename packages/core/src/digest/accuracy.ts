import { mean } from '../math'
import type { ActivityDigest, VirtualPowerAccuracy } from '../types'
import { fitBikeModel } from '../virtualPower'
import type { Calibrated } from './calibration'
import { CalibrationPool } from './calibration'
import { powerAt } from './terms'

export type { Calibrated } from './calibration'

/**
 * Leave-one-ride-out accuracy: each ride's climb sections are scored with a bike model fitted on
 * the other rides, then the sections are pooled. Each ride is scored at the total mass it rode at.
 */
export function leaveOneOutAccuracy(
  calibrated: Calibrated[],
  totalMassOf: (digest: ActivityDigest) => number,
): VirtualPowerAccuracy | null {
  const pool = new CalibrationPool(calibrated, totalMassOf)
  const segments = calibrated.flatMap(({ digest, sums }) => {
    const totalMassKg = totalMassOf(digest)
    const model = fitBikeModel(pool.stats({ massKg: totalMassKg, sums })).model
    return digest.climbSections.map((section) => ({
      activityId: digest.id,
      start: section.start,
      end: section.end,
      measuredW: section.measuredW,
      estimatedW: powerAt(section.terms, totalMassKg, model),
    }))
  })
  // Without a qualifying climb there is nothing to score, so there is no accuracy to report.
  if (segments.length === 0) return null
  const relErr = segments.map((s) => (s.estimatedW - s.measuredW) / s.measuredW)
  return {
    nSegments: segments.length,
    mape: mean(relErr.map(Math.abs)),
    bias: mean(relErr),
    segments,
  }
}
