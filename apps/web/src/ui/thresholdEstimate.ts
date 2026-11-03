import type { AnalysisResult } from '@rca/core/pipeline'
import type { ThresholdEstimate } from '@rca/core/threshold'
import type { Sport } from '@rca/core/types'

/**
 * Each sport's threshold estimate in a result: the strongest effort of each of its activities, scaled to an hour and averaged
 * (docs/design/threshold.md). Null only where the sport has no effort its table reads (3 min for a ride, 8 for a run). The one place a screen asks which
 * field a sport's threshold is in, so the card, the tile, the range, the chart's line and the share card read the same number.
 */
const ESTIMATE_OF: Record<Sport, (result: AnalysisResult) => ThresholdEstimate | null> = {
  run: (result) => result.runThreshold,
  ride: (result) => result.rideThreshold,
}

export function thresholdEstimate(result: AnalysisResult, sport: Sport): ThresholdEstimate | null {
  return ESTIMATE_OF[sport](result)
}
