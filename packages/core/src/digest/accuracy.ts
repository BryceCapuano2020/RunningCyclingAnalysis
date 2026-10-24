import { mean } from '../math'
import type { ActivityDigest, CalibrationSums, VirtualPowerAccuracy } from '../types'
import { fitBikeModel } from '../virtualPower'
import { calibrationStatsAt, subtractCalibrationSums } from './calibration'
import { powerAt } from './terms'

export interface Calibrated {
  digest: ActivityDigest
  sums: CalibrationSums
}

/**
 * Leave-one-ride-out accuracy: each ride's climb sections are scored with a bike model fitted on
 * the other rides, then the sections are pooled.
 */
export function leaveOneOutAccuracy(
  calibrated: Calibrated[],
  totalSums: CalibrationSums,
  totalMassKg: number,
): VirtualPowerAccuracy | null {
  const segments = calibrated.flatMap(({ digest, sums }) => {
    const others = subtractCalibrationSums(totalSums, sums)
    const model = fitBikeModel(calibrationStatsAt(others, totalMassKg)).model
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
