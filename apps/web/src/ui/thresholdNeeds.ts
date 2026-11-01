import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { indoorNeedLine } from './indoorCopy'
import { THRESHOLD_NEEDS_TEXT } from './sports'
import { floorOf } from './thresholdFloor'

/**
 * The line in a threshold's place when the sport holds no best to show a floor from: what to add. A sport whose only
 * activities were indoors, where an indoor effort holds no best, says so with the count instead of asking for an effort.
 * A sport with a best never reaches this line: its threshold, or its floor, is the number.
 */
export function thresholdNeedsLine(result: AnalysisResult, sport: Sport): string {
  const indoor = indoorNeedLine(result.activities, sport, floorOf(result, sport) !== null)
  return indoor ?? THRESHOLD_NEEDS_TEXT
}
