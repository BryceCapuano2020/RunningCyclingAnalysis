import { DEFAULT_BIKE_MODEL, DRIVETRAIN_EFFICIENCY, G, RHO_AIR } from '../constants'
import type { BikeModel } from '../types'
import { accelerationOf } from './estimatePower'

export interface CalibrationRide {
  activityId: string
  speed: Float64Array
  grade: Float64Array
  power: Float64Array
  valid: Uint8Array
}

/**
 * Normal-equation sufficient statistics over 30 s blocks. Sums of x1^2, x1*x2, x2^2,
 * x1*y and x2*y, where each block contributes its block means, plus the block count.
 */
export interface CalibrationStats {
  blocks: number
  s11: number
  s12: number
  s22: number
  s1y: number
  s2y: number
}

const BLOCK_SAMPLES = 30
const MIN_BLOCKS = 20
const MIN_SPEED_MS = 2
const CRR_RANGE = [0.002, 0.012] as const
const CDA_RANGE = [0.2, 0.5] as const
const SINGULAR_REL_TOL = 1e-12

export function emptyStats(): CalibrationStats {
  return { blocks: 0, s11: 0, s12: 0, s22: 0, s1y: 0, s2y: 0 }
}

export function addStats(a: CalibrationStats, b: CalibrationStats): CalibrationStats {
  return {
    blocks: a.blocks + b.blocks,
    s11: a.s11 + b.s11,
    s12: a.s12 + b.s12,
    s22: a.s22 + b.s22,
    s1y: a.s1y + b.s1y,
    s2y: a.s2y + b.s2y,
  }
}

export function subtractStats(a: CalibrationStats, b: CalibrationStats): CalibrationStats {
  return {
    blocks: a.blocks - b.blocks,
    s11: a.s11 - b.s11,
    s12: a.s12 - b.s12,
    s22: a.s22 - b.s22,
    s1y: a.s1y - b.s1y,
    s2y: a.s2y - b.s2y,
  }
}

function clamp(x: number, [lo, hi]: readonly [number, number]): number {
  return Math.min(hi, Math.max(lo, x))
}

/** Statistics of every usable 30 s block of one ride. */
export function rideStats(ride: CalibrationRide, totalMassKg: number): CalibrationStats {
  const stats = emptyStats()
  const accel = accelerationOf(ride.speed)
  const n = ride.speed.length
  for (let start = 0; start + BLOCK_SAMPLES <= n; start += BLOCK_SAMPLES) {
    let sy = 0
    let s1 = 0
    let s2 = 0
    let usable = true
    for (let i = start; i < start + BLOCK_SAMPLES; i++) {
      const v = ride.speed[i]!
      const g = ride.grade[i]!
      const p = ride.power[i]!
      usable =
        ride.valid[i] === 1 &&
        Number.isFinite(v) &&
        v > MIN_SPEED_MS &&
        Number.isFinite(g) &&
        Number.isFinite(p)
      if (!usable) break
      const theta = Math.atan(g)
      sy +=
        p * DRIVETRAIN_EFFICIENCY -
        totalMassKg * G * Math.sin(theta) * v -
        totalMassKg * accel[i]! * v
      s1 += totalMassKg * G * Math.cos(theta) * v
      s2 += 0.5 * RHO_AIR * v * v * v
    }
    if (!usable) continue
    const y = sy / BLOCK_SAMPLES
    const x1 = s1 / BLOCK_SAMPLES
    const x2 = s2 / BLOCK_SAMPLES
    if (!(Number.isFinite(y) && Number.isFinite(x1) && Number.isFinite(x2))) continue
    stats.blocks += 1
    stats.s11 += x1 * x1
    stats.s12 += x1 * x2
    stats.s22 += x2 * x2
    stats.s1y += x1 * y
    stats.s2y += x2 * y
  }
  return stats
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

/**
 * Fits crr and cda by least squares over 30 s blocks of rides with a power meter.
 * Falls back to DEFAULT_BIKE_MODEL when there are fewer than 20 usable blocks, the
 * normal equations are singular, or the result is not finite.
 */
export function calibrateBikeModel(rides: CalibrationRide[], totalMassKg: number): BikeModel {
  const total = rides.reduce(
    (acc, ride) => addStats(acc, rideStats(ride, totalMassKg)),
    emptyStats(),
  )
  return solveBikeModel(total)
}
