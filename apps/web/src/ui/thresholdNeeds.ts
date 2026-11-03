import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { indoorNeedLine } from './indoorCopy'
import { THRESHOLD_NEEDS_TEXT } from './sports'

/**
 * The line in a threshold's place when the sport holds no effort of 3 min or more: what to add. A sport whose only
 * activities were indoors, where an indoor effort holds no best, says so with the count instead of asking for an effort.
 * A sport with an effort never reaches this line: its threshold is the number.
 */
export function thresholdNeedsLine(result: AnalysisResult, sport: Sport): string {
  return indoorNeedLine(result.activities, sport, false) ?? THRESHOLD_NEEDS_TEXT[sport]
}
