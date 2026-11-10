/**
 * Fitness at the same effort, per sport: the level now at one heart rate, or what a trend still needs.
 * See docs/design/fitness.md.
 */
export { fitnessFigures, fitnessLines } from './copy'
export type { FitnessFigures, FitnessLines } from './copy'
export { fitnessHistories, fitnessOfSport, fitnessStatuses } from './compute'
export type { FitnessHistory, FitnessOptions } from './compute'
export { FITNESS, RIDE_FITNESS_ENABLED } from './params'
export { NO_FITNESS, noFitness } from './types'
export type {
  FitnessBySport,
  FitnessEntry,
  FitnessEvidence,
  FitnessLevel,
  FitnessMethod,
  FitnessPoint,
  FitnessSpan,
  FitnessState,
  FitnessStatus,
  Ranged,
  Shortfall,
} from './types'
