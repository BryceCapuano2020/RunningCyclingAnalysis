/**
 * Fitness at the same effort, per sport: slipping, holding, holding below the old level, recovering,
 * back, or not enough evidence yet. See docs/design/fitness.md.
 */
export { fitnessFindingHeadline, fitnessLines } from './copy'
export type { FitnessLines } from './copy'
export { fitnessOfSport, fitnessStatuses } from './compute'
export type { FitnessOptions } from './compute'
export { FITNESS, RIDE_FITNESS_ENABLED } from './params'
export { NO_FITNESS, noFitness } from './types'
export type {
  FitnessBySport,
  FitnessEntry,
  FitnessEvidence,
  FitnessMethod,
  FitnessSpan,
  FitnessState,
  FitnessStatus,
  Ranged,
  Shortfall,
} from './types'
