export { countFlags, digestActivity, DIGEST_VERSION } from './digestActivity'
export { MODEL_REVISION } from './modelRevision'
export {
  activitySummaries,
  combine,
  equivalenceFor,
  equivalentRunSpeed,
  sportCurves,
} from './combine'
export { fitnessTrend } from './trend'
export { weeksWithValue } from './trendPoints'
export type { TrendOptions, TrendPoint } from './trend'
export type { AnalysisResult, BikeModelSource, Equivalence } from './combine'
export type { ActivitySummary } from './summary'
export type { SportCurves } from '../types'
export { parseDigest, serializeDigest } from './serialize'
