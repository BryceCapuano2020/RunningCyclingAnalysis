import { DAY_MS } from '../constants'
import { FITNESS } from './params'

const F = FITNESS.fit

/** One kilometre read for the fit: its heart rate, log clock speed and grade credit (log of clock over grade-adjusted time; positive on a climb). */
export interface KmReading {
  hr: number
  lnClock: number
  credit: number
}

/** The kilometres of one run, dated, for fitting within blocks of weeks. */
export interface DatedKm {
  startMs: number
  kms: readonly KmReading[]
}

export interface GradeFit {
  /** How the log of clock speed moves with the credit at one heart rate; -1 would be the model's whole credit. */
  kappa: number
  /** The log of speed gained per bpm of heart rate. */
  beta: number
  /** Kilometres the fit stood on. */
  n: number
  /** Whether it can be trusted; when not, the strict unit is read instead. */
  stable: boolean
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** Rows grouped into blocks of `blockDays` days, as slopes are fitted within blocks so that a season's drift does not tilt them. Blocks with fewer than `min` rows tell nothing. */
function blocksOf<T extends { startMs: number }>(rows: readonly T[], min: number): T[][] {
  const blocks = new Map<number, T[]>()
  for (const row of rows) {
    const key = Math.floor(row.startMs / (F.blockDays * DAY_MS))
    const block = blocks.get(key) ?? []
    block.push(row)
    blocks.set(key, block)
  }
  return [...blocks.values()].filter((b) => b.length >= min)
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** A heart rate and a value to regress on it, dated. */
export interface SlopeRow {
  startMs: number
  hr: number
  value: number
}

export interface SlopeLimits {
  minBlock: number
  min: number
  max: number
  fallback: number
}

/**
 * The slope of `value` on heart rate within blocks: for the strict unit, for rides, and for a library
 * whose grade credit barely varies, where only the heart-rate slope can be fitted. Clamped, and the
 * fallback when the heart rates hardly vary.
 */
export function fitHeartRateSlope(rows: readonly SlopeRow[], limits: SlopeLimits): number {
  let sxy = 0
  let sxx = 0
  let n = 0
  for (const block of blocksOf(rows, limits.minBlock)) {
    const mh = mean(block.map((k) => k.hr))
    const mv = mean(block.map((k) => k.value))
    for (const k of block) {
      sxy += (k.hr - mh) * (k.value - mv)
      sxx += (k.hr - mh) ** 2
      n++
    }
  }
  if (n === 0 || sxx / n < F.minHrSd ** 2) return limits.fallback
  return clamp(sxy / sxx, limits.min, limits.max)
}

/** The slope limits of the run unit. */
export const RUN_SLOPE: SlopeLimits = {
  minBlock: F.minBlockKm,
  min: F.betaMin,
  max: F.betaMax,
  fallback: F.betaFallback,
}

/**
 * Fits, per library, the log of clock speed on heart rate and grade credit together within blocks:
 * beta (per bpm) and kappa. Kappa is an empirical nuisance coefficient, not a measure of how much of the model's
 * credit is physiologically real: pace regressed on grade credit within steady runs mixes the structural
 * pass-through with the heart-rate sensitivity, the noise in the heart rate and the runner's habit of easing off on
 * a climb, so errors in the variables pull it toward zero (about a third comes back when the structural value is 1; see
 * the planted-truth test in unit.test.ts). What it does is take the route's credit out of the value in the way the
 * runs themselves show, so the value is level against it. Unstable (so the strict unit is used)
 * with fewer than 300 kilometres, or kappa further than 0.5 outside [-1, 0], or known no better than
 * +-0.25. With too little spread in the credit to fit, the whole credit is taken (kappa -1) and only the
 * heart-rate slope is fitted: it does not matter then.
 */
export function fitGrade(runs: readonly DatedKm[]): GradeFit {
  const all = runs.flatMap((r) => r.kms.map((k) => ({ ...k, startMs: r.startMs })))
  const n = all.length
  const unstable = (beta: number): GradeFit => ({ kappa: -1, beta, n, stable: false })
  if (n < F.minKm) return unstable(F.betaFallback)
  const credits = all.map((k) => k.credit)
  const mc = mean(credits)
  const creditSd = Math.sqrt(credits.reduce((a, c) => a + (c - mc) ** 2, 0) / (n - 1))
  if (creditSd < F.minCreditSd) {
    const rows = all.map((k) => ({ startMs: k.startMs, hr: k.hr, value: k.lnClock + k.credit }))
    const beta = fitHeartRateSlope(rows, RUN_SLOPE)
    return { kappa: -1, beta, n, stable: true }
  }
  let s11 = 0
  let s12 = 0
  let s22 = 0
  let s1y = 0
  let s2y = 0
  let syy = 0
  let used = 0
  const blocks = blocksOf(all, F.minBlockKm)
  for (const block of blocks) {
    const m1 = mean(block.map((k) => k.hr))
    const m2 = mean(block.map((k) => k.credit))
    const my = mean(block.map((k) => k.lnClock))
    for (const k of block) {
      const a = k.hr - m1
      const b = k.credit - m2
      const y = k.lnClock - my
      s11 += a * a
      s12 += a * b
      s22 += b * b
      s1y += a * y
      s2y += b * y
      syy += y * y
      used++
    }
  }
  const det = s11 * s22 - s12 * s12
  const dof = used - blocks.length - 2
  if (!(det > 0) || !(dof > 0) || s11 / used < F.minHrSd ** 2) return unstable(F.betaFallback)
  const beta = (s1y * s22 - s2y * s12) / det
  const kappa = (s2y * s11 - s1y * s12) / det
  const residual = Math.max(0, syy - beta * s1y - kappa * s2y) / dof
  const kappaSe = Math.sqrt((residual * s11) / det)
  const stable =
    kappaSe <= F.maxKappaSe &&
    kappa >= F.kappaMin - F.kappaSlack &&
    kappa <= F.kappaMax + F.kappaSlack
  return {
    kappa: clamp(kappa, F.kappaMin, F.kappaMax),
    beta: clamp(beta, F.betaMin, F.betaMax),
    n,
    stable,
  }
}
