import type { Detector } from '../types'
import { fitnessStatusDetector } from './fitnessStatus'

/**
 * Every detector, one per line, in the order they are run. Adding a detector adds its import and its
 * entry here and nothing else; the registry builds the per-sport lists from their `sports`.
 */
export const DETECTORS: readonly Detector[] = [fitnessStatusDetector]
