import { DRIVETRAIN_EFFICIENCY } from '../constants'
import type { CalibrationSums } from '../types'
import type { CalibrationStats } from '../virtualPower'
import type { SampleTerms } from './terms'

const BLOCK_SAMPLES = 30
const MIN_SPEED_MS = 2

export function emptyCalibrationSums(): CalibrationSums {
  return { blocks: 0, rr: 0, ra: 0, aa: 0, rP: 0, rG: 0, aP: 0, aG: 0 }
}

export function addCalibrationSums(a: CalibrationSums, b: CalibrationSums): CalibrationSums {
  return {
    blocks: a.blocks + b.blocks,
    rr: a.rr + b.rr,
    ra: a.ra + b.ra,
    aa: a.aa + b.aa,
    rP: a.rP + b.rP,
    rG: a.rG + b.rG,
    aP: a.aP + b.aP,
    aG: a.aG + b.aG,
  }
}

export function subtractCalibrationSums(a: CalibrationSums, b: CalibrationSums): CalibrationSums {
  return {
    blocks: a.blocks - b.blocks,
    rr: a.rr - b.rr,
    ra: a.ra - b.ra,
    aa: a.aa - b.aa,
    rP: a.rP - b.rP,
    rG: a.rG - b.rG,
    aP: a.aP - b.aP,
    aG: a.aG - b.aG,
  }
}

/**
 * Normal-equation statistics for total mass massKg. With block means r (rolling), a (aero), g
 * (gravity and acceleration) and P (measured power times drivetrain efficiency), the regression
 * target is P - m * g, with regressors m * r and a. Expanding the normal equations gives the
 * expressions below, so the mass-free sums in CalibrationSums suffice for any mass.
 */
export function calibrationStatsAt(sums: CalibrationSums, massKg: number): CalibrationStats {
  const m = massKg
  return {
    blocks: sums.blocks,
    s11: m * m * sums.rr,
    s12: m * sums.ra,
    s22: sums.aa,
    s1y: m * sums.rP - m * m * sums.rG,
    s2y: sums.aP - m * sums.aG,
  }
}

/**
 * Sums over the 30 s blocks of one outdoor ride with a power meter. A block counts only when
 * every sample is valid, moving faster than 2 m/s, and has finite power and terms.
 */
export function calibrationSums(
  terms: SampleTerms,
  speed: Float64Array,
  power: Float64Array,
  valid: Uint8Array,
): CalibrationSums {
  const sums = emptyCalibrationSums()
  const n = speed.length
  for (let start = 0; start + BLOCK_SAMPLES <= n; start += BLOCK_SAMPLES) {
    const end = start + BLOCK_SAMPLES
    let usable = true
    let p = 0
    let g = 0
    let r = 0
    let a = 0
    for (let i = start; i < end; i++) {
      const gi = terms.gravityAccel[i]!
      const ri = terms.rolling[i]!
      const ai = terms.aero[i]!
      const pi = power[i]!
      if (
        valid[i] !== 1 ||
        !(speed[i]! > MIN_SPEED_MS) ||
        !Number.isFinite(pi) ||
        !Number.isFinite(gi) ||
        !Number.isFinite(ri) ||
        !Number.isFinite(ai)
      ) {
        usable = false
        break
      }
      p += pi * DRIVETRAIN_EFFICIENCY
      g += gi
      r += ri
      a += ai
    }
    if (!usable) continue
    const P = p / BLOCK_SAMPLES
    const G = g / BLOCK_SAMPLES
    const R = r / BLOCK_SAMPLES
    const A = a / BLOCK_SAMPLES
    sums.blocks += 1
    sums.rr += R * R
    sums.ra += R * A
    sums.aa += A * A
    sums.rP += R * P
    sums.rG += R * G
    sums.aP += A * P
    sums.aG += A * G
  }
  return sums
}
