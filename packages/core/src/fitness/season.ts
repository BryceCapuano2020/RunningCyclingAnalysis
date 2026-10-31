import { FITNESS } from './params'
import { slice } from './windows'
import type { RunPoint } from './windows'
import { medianInPlace } from '../math'

const S = FITNESS.season

/** An athlete's seasonal swing in the value of a run (log units): `cos` and `sin` of the day of the year. */
export interface Season {
  cos: number
  sin: number
  /** Size of the swing, from the middle to the peak. */
  amplitude: number
}

const YEAR_DAYS = 365.25
const OMEGA = (2 * Math.PI) / YEAR_DAYS

/** The seasonal part of a run's value on day `t`. */
export const seasonOf = (season: Season, t: number): number =>
  season.cos * Math.cos(OMEGA * t) + season.sin * Math.sin(OMEGA * t)

/** The runs with their season taken out, from `fromDay` on: what every test reads once a pattern has been found. */
export function withoutSeason(
  runs: readonly RunPoint[],
  season: Season | null,
  fromDay: number,
  toDay: number,
): readonly RunPoint[] {
  if (season === null) return runs
  return slice(runs, fromDay, toDay).map((r) =>
    Object.assign({}, r, { x: r.x - seasonOf(season, r.t) }),
  )
}

interface Fit {
  mean: number
  cos: number
  sin: number
}

/** Least squares of the values on a constant, cosine and sine of the day of the year (a 3 by 3 system). */
function leastSquares(runs: readonly RunPoint[], keep: (i: number) => boolean): Fit | null {
  const a = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  const b = [0, 0, 0]
  let n = 0
  for (let i = 0; i < runs.length; i++) {
    if (!keep(i)) continue
    const r = runs[i]!
    const row = [1, Math.cos(OMEGA * r.t), Math.sin(OMEGA * r.t)]
    for (let j = 0; j < 3; j++) {
      b[j]! += row[j]! * r.x
      for (let k = 0; k < 3; k++) a[j * 3 + k]! += row[j]! * row[k]!
    }
    n++
  }
  if (n < 3) return null
  // Solve by Cramer's rule.
  const det3 = (m: number[]) =>
    m[0]! * (m[4]! * m[8]! - m[5]! * m[7]!) -
    m[1]! * (m[3]! * m[8]! - m[5]! * m[6]!) +
    m[2]! * (m[3]! * m[7]! - m[4]! * m[6]!)
  const d = det3(a)
  if (!(Math.abs(d) > 1e-12)) return null
  const solve = (col: number) => {
    const m = a.slice()
    for (let j = 0; j < 3; j++) m[j * 3 + col] = b[j]!
    return det3(m) / d
  }
  return { mean: solve(0), cos: solve(1), sin: solve(2) }
}

/**
 * The athlete's seasonal swing as of `day`, or null: fewer than two whole years of steady runs, too few runs in
 * a quarter of the year, or a swing that does not stand out from the wander of the level. The last whole years
 * of runs (up to four) are fitted with a constant, so a step part-way through leaks only a little into the
 * swing (and what it leaves in the residuals gates the term out, in most libraries); the fit is repeated with outlying runs clipped; then the swing is shrunk by how far it stands above
 * the variance of one coefficient, taken from the weekly levels and their lag-1 correlation.
 */
export function fitSeason(runs: readonly RunPoint[], day: number): Season | null {
  const first = runs[0]?.t
  if (first === undefined || day - first < S.minYears * YEAR_DAYS) return null
  const years = Math.min(S.maxYears, Math.floor((day - first) / YEAR_DAYS))
  const rs = slice(runs, day - years * YEAR_DAYS, day)
  if (rs.length < S.minRuns) return null
  const quarters = [0, 0, 0, 0]
  for (const r of rs)
    quarters[Math.floor(((((r.t % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS) / YEAR_DAYS) * 4)]!++
  if (quarters.some((q) => q < S.minQuarterRuns)) return null
  let fit = leastSquares(rs, () => true)
  if (fit === null) return null
  const residual = (r: RunPoint, f: Fit) =>
    r.x - f.mean - f.cos * Math.cos(OMEGA * r.t) - f.sin * Math.sin(OMEGA * r.t)
  const spread = 1.4826 * medianInPlace(Float64Array.from(rs, (r) => Math.abs(residual(r, fit!))))
  const refit = leastSquares(rs, (i) => Math.abs(residual(rs[i]!, fit!)) <= S.clip * spread)
  if (refit === null) return null
  fit = refit
  // Weekly means of the residuals, and their lag-1 correlation.
  const weeks = new Map<number, { sum: number; n: number }>()
  for (const r of rs) {
    const key = Math.floor(r.t / 7)
    const cell = weeks.get(key) ?? { sum: 0, n: 0 }
    cell.sum += Math.min(S.clip * spread, Math.max(-S.clip * spread, residual(r, fit)))
    cell.n++
    weeks.set(key, cell)
  }
  const keys = [...weeks.keys()].sort((p, q) => p - q)
  const e = keys.map((k) => weeks.get(k)!.sum / weeks.get(k)!.n)
  const W = e.length
  if (W < 20) return null
  const me = e.reduce((p, q) => p + q, 0) / W
  let v0 = 0
  let v1 = 0
  let pairs = 0
  for (let i = 0; i < W; i++) v0 += (e[i]! - me) ** 2
  for (let i = 1; i < W; i++) {
    if (keys[i]! - keys[i - 1]! === 1) {
      v1 += (e[i]! - me) * (e[i - 1]! - me)
      pairs++
    }
  }
  const rho = pairs < 10 || !(v0 > 0) ? 0 : Math.min(S.maxRho, Math.max(0, v1 / pairs / (v0 / W)))
  const varCoef = ((2 / W) * (v0 / W) * (1 + rho)) / (1 - rho)
  const size2 = fit.cos ** 2 + fit.sin ** 2
  const shrink = Math.max(0, 1 - (S.shrinkK * varCoef) / size2)
  const amplitude = Math.min(S.maxAmplitude, shrink * Math.sqrt(size2))
  if (!(amplitude >= S.minAmplitude)) return null
  const scale = amplitude / Math.sqrt(size2)
  return { cos: fit.cos * scale, sin: fit.sin * scale, amplitude }
}

/** The same swing for the negated series (a rise is followed as a slip of it): its two terms change sign. */
export const negatedSeason = (season: Season | null): Season | null =>
  season === null ? null : { ...season, cos: -season.cos, sin: -season.sin }
