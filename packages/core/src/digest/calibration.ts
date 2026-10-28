import { DEFAULT_BIKE_MODEL, DRIVETRAIN_EFFICIENCY } from '../constants'
import type { ActivityDigest, CalibrationSums } from '../types'
import type { CalibrationStats } from '../virtualPower'
import type { SampleTerms } from './terms'
import { SELECTION_MASS_KG } from './terms'

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

/** A power-meter ride with its calibration sums. */
export interface Calibrated {
  digest: ActivityDigest
  sums: CalibrationSums
}

/** The calibration statistics of every power-meter ride in ordered, in that order. */
export function calibratedOf(ordered: ActivityDigest[]): Calibrated[] {
  return ordered.flatMap((digest) =>
    digest.calibration === null ? [] : [{ digest, sums: digest.calibration }],
  )
}

function addStats(a: CalibrationStats, b: CalibrationStats): CalibrationStats {
  return {
    blocks: a.blocks + b.blocks,
    s11: a.s11 + b.s11,
    s12: a.s12 + b.s12,
    s22: a.s22 + b.s22,
    s1y: a.s1y + b.s1y,
    s2y: a.s2y + b.s2y,
  }
}

const NO_STATS: CalibrationStats = { blocks: 0, s11: 0, s12: 0, s22: 0, s1y: 0, s2y: 0 }

/**
 * The sums of power-meter rides pooled by the total mass each rides at. The statistics for a mass
 * only need the sums of the rides at that mass, so rides at different masses add their statistics,
 * and rides all at one mass give the statistics of their total sums exactly.
 */
export class CalibrationPool {
  private readonly groups = new Map<number, CalibrationSums>()

  constructor(calibrated: readonly Calibrated[], massOf: (digest: ActivityDigest) => number) {
    for (const { digest, sums } of calibrated) {
      const mass = massOf(digest)
      this.groups.set(
        mass,
        addCalibrationSums(this.groups.get(mass) ?? emptyCalibrationSums(), sums),
      )
    }
  }

  /** The statistics of every ride, or of every ride but one that rides at `without.massKg`. */
  stats(without?: { massKg: number; sums: CalibrationSums }): CalibrationStats {
    let total = NO_STATS
    for (const [mass, sums] of this.groups) {
      const own = without?.massKg === mass ? subtractCalibrationSums(sums, without.sums) : sums
      total = addStats(total, calibrationStatsAt(own, mass))
    }
    return total
  }
}

/**
 * Sums over the 30 s blocks of one outdoor ride with a power meter. A block counts only when every
 * sample is valid, moving faster than 2 m/s, has finite terms, and has measured power above zero
 * and a default-model estimate at or above zero. Coasting reads 0 W while the physics needs
 * negative power, so those blocks would pull the fit to its bounds.
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
      const modelled =
        (SELECTION_MASS_KG * (gi + DEFAULT_BIKE_MODEL.crr * ri) + DEFAULT_BIKE_MODEL.cda * ai) /
        DRIVETRAIN_EFFICIENCY
      if (
        valid[i] !== 1 ||
        !(speed[i]! > MIN_SPEED_MS) ||
        !Number.isFinite(pi) ||
        !(pi > 0) ||
        !Number.isFinite(gi) ||
        !Number.isFinite(ri) ||
        !Number.isFinite(ai) ||
        !(modelled >= 0)
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
