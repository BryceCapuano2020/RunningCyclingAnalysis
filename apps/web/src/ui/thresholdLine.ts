import { PRIORS } from '@rca/core/constants'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { ThresholdLine } from './charts/sportCurveModel'
import { thresholdRange } from './thresholdRange'
import { thresholdEstimate } from './thresholdEstimate'

/** A threshold's metabolic W/kg as the sport's own number: flat speed in m/s for running, watts for cycling. */
type Native = (metabolicWkg: number, massKg: number) => number
const NATIVE: Record<Sport, Native> = {
  run: (cp) => metabolicToFlatSpeed(cp),
  ride: (cp, massKg) => metabolicToRidePower(cp, massKg, PRIORS.grossEfficiency.mean),
}

/**
 * The sport's threshold as the curve chart draws it: the estimate in the curve's own number, and its 10th to 90th percentile as
 * the band, from the same number the answer's figure reads, so the line and the figure agree. The line is named as an estimate
 * where the strongest effort behind it is from estimated watts. Null without a threshold.
 */
export function thresholdLine(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): ThresholdLine | null {
  const estimate = thresholdEstimate(result, sport)
  if (!estimate) return null
  const native = NATIVE[sport]
  return {
    value: native(estimate.value, massKg),
    low: native(estimate.low, massKg),
    high: native(estimate.high, massKg),
    detail: thresholdRange(result, sport, massKg, units) ?? undefined,
    estimated: estimate.efforts.strongest.estimated,
  }
}
