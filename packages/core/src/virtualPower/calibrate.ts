import { DEFAULT_BIKE_MODEL } from '../constants'
import type { BikeModel } from '../types'

/** Normal-equation sufficient statistics for fitting crr and cda by least squares. */
export interface CalibrationStats {
  blocks: number
  s11: number
  s12: number
  s22: number
  s1y: number
  s2y: number
}

const MIN_BLOCKS = 20
const CRR_RANGE = [0.002, 0.012] as const
const CDA_RANGE = [0.2, 0.5] as const
const SINGULAR_REL_TOL = 1e-12
/**
 * Largest allowed cosine between the two regressors (uncentred). Above this the rolling and aero
 * terms are nearly proportional, which happens at near-constant speed, and the split between crr
 * and cda is not identified.
 */
const MAX_REGRESSOR_COSINE = 0.98

/** Whether the bike model was fitted to the rides, or is DEFAULT_BIKE_MODEL. */
export type BikeModelSource = 'calibrated' | 'default'

function inside(x: number, [lo, hi]: readonly [number, number]): boolean {
  return x > lo && x < hi
}

/**
 * Solves the 2x2 normal equations for crr and cda. Falls back to DEFAULT_BIKE_MODEL, with source
 * 'default', when there are fewer than 20 blocks, the regressors are nearly collinear, the system
 * is singular, the solution is not finite, or either coefficient lies on or outside its range. A
 * clamped coefficient is not a fit, so clamping is never used.
 */
export function fitBikeModel(stats: CalibrationStats): {
  model: BikeModel
  source: BikeModelSource
} {
  const fallback = { model: { ...DEFAULT_BIKE_MODEL }, source: 'default' as const }
  if (stats.blocks < MIN_BLOCKS) return fallback
  const { s11, s12, s22, s1y, s2y } = stats
  const det = s11 * s22 - s12 * s12
  if (!(Math.abs(det) > SINGULAR_REL_TOL * s11 * s22)) return fallback
  const cosine = Math.abs(s12) / Math.sqrt(s11 * s22)
  if (!(cosine <= MAX_REGRESSOR_COSINE)) return fallback

  const crr = (s22 * s1y - s12 * s2y) / det
  const cda = (s11 * s2y - s12 * s1y) / det
  if (!inside(crr, CRR_RANGE) || !inside(cda, CDA_RANGE)) return fallback
  return { model: { crr, cda }, source: 'calibrated' }
}

/** The bike model from fitBikeModel, without its source. */
export function solveBikeModel(stats: CalibrationStats): BikeModel {
  return fitBikeModel(stats).model
}
