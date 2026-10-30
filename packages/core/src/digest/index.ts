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
export { effortsCount } from './effortTrust'
export { weeksWithValue } from './trendPoints'
export type { TrendOptions, TrendPoint } from './trend'
export type { AnalysisResult, BikeModelSource, Equivalence } from './combine'
export type { ActivitySummary } from './summary'
export type { SportCurves } from '../types'
export { parseDigest, serializeDigest } from './serialize'
export { NO_SAME_HEART_RATE } from './sameHeartRateTypes'
export type {
  Lack,
  SameHeartRate,
  SameHeartRateBySport,
  SameHeartRateWeek,
} from './sameHeartRateTypes'
export { periodDurability } from './durabilityPeriod'
export type { DurabilityAfter, DurabilityBest, PeriodDurabilityRow } from './durabilityPeriod'
export { driftTrend } from './driftTrend'
export type { DriftPoint } from './driftTrend'
export { lateEvidence } from './lateEvidence'
export { NO_LATE_EVIDENCE } from './lateEvidenceTypes'
export type { LateEvidence, LateEvidenceBySport } from './lateEvidenceTypes'
