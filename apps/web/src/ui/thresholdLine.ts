import { nativeOfWkg } from '@rca/core/display'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import type { ThresholdLine } from './charts/sportCurveModel'
import { thresholdRange } from './thresholdRange'
import { thresholdEstimate } from './thresholdEstimate'

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
  const native = (wkg: number) => nativeOfWkg(sport, wkg, massKg)
  return {
    value: native(estimate.value),
    low: native(estimate.low),
    high: native(estimate.high),
    detail: thresholdRange(result, sport, massKg, units) ?? undefined,
    estimated: estimate.efforts.strongest.estimated,
  }
}
