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

function clamp(x: number, [lo, hi]: readonly [number, number]): number {
  return Math.min(hi, Math.max(lo, x))
}

/**
 * Solves the 2x2 normal equations for crr and cda, clamped to their ranges.
 * Falls back to DEFAULT_BIKE_MODEL with fewer than 20 blocks, a singular system,
 * or a non-finite result.
 */
export function solveBikeModel(stats: CalibrationStats): BikeModel {
  if (stats.blocks < MIN_BLOCKS) return { ...DEFAULT_BIKE_MODEL }
  const { s11, s12, s22, s1y, s2y } = stats
  const det = s11 * s22 - s12 * s12
  if (!(Math.abs(det) > SINGULAR_REL_TOL * s11 * s22)) return { ...DEFAULT_BIKE_MODEL }

  const crr = clamp((s22 * s1y - s12 * s2y) / det, CRR_RANGE)
  const cda = clamp((s11 * s2y - s12 * s1y) / det, CDA_RANGE)
  if (!Number.isFinite(crr) || !Number.isFinite(cda)) return { ...DEFAULT_BIKE_MODEL }
  return { crr, cda }
}
