import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { fitRestsOnEstimate } from './thresholdRange'

/** Said under a ride's range when its uneven fit draws on estimated watts. */
const ESTIMATE_LINE = 'The top end uses estimated watts.'

/** Whether a sport's uneven fit rests on estimated watts: a run's pace never does. Keyed by Sport. */
const RESTS_ON_ESTIMATE: Record<Sport, (result: AnalysisResult) => boolean> = {
  run: () => false,
  ride: fitRestsOnEstimate,
}

/**
 * The line under a threshold's range when the sport has an uneven fit that draws on estimated watts. The range itself
 * shows the uneven fit's spread, so no line names the bests it left out. Null without one.
 */
export function unevenNote(result: AnalysisResult, sport: Sport): string | null {
  const uneven = { run: result.runCpUneven, ride: result.rideCpUneven }[sport]
  return uneven && RESTS_ON_ESTIMATE[sport](result) ? ESTIMATE_LINE : null
}
