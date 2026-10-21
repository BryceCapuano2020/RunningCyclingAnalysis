import { combine } from './digest/combine'
import type { AnalysisResult } from './digest/combine'
import { digestActivity } from './digest/digestActivity'
import type { Activity, AthleteSettings } from './types'

export type { ActivitySummary, AnalysisResult, Equivalence } from './digest/combine'
export { equivalentRunSpeed } from './digest/combine'

/** Digests each activity, then combines the digests with the athlete's settings. */
export function analyze(activities: Activity[], settings: AthleteSettings): AnalysisResult {
  return combine(
    activities.map((activity) => digestActivity(activity)),
    settings,
  )
}
