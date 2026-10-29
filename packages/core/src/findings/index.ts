/**
 * The findings engine's public surface: what the app reads to evaluate, rank and word findings. The
 * statistics, scoring and table internals stay behind it; detectors import them by relative path.
 */
export { FINDING_SPORTS, FINDINGS } from './constants'
export { copyOf, factText, lintFinding } from './copy'
export { evaluate, evaluateDetailed, findingId } from './evaluate'
export type { EvaluateOptions, Evaluation, Memory, Rejection, Scored } from './evaluate'
export { inputAt, latestStartMs } from './input'
export type { FindingSource } from './input'
export { REGISTRY } from './registry'
export type { Registry } from './registry'
export { byRank, selectFindings } from './select'
export type {
  Candidate,
  Detector,
  DetectorId,
  Direction,
  Finding,
  FindingInput,
  Kind,
  LikelyCause,
  Method,
  NumberFact,
  Ref,
  SignEvidence,
  Span,
  Support,
  SurpriseInput,
} from './types'
