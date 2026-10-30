import { medianInPlace } from '../math'
import { FITNESS } from './params'

const M = FITNESS.monitor

/** One steady run: when it was (days since a fixed Monday, so weeks line up for every library) and its value, the log of speed or power at the reference heart rate. */
export interface RunPoint {
  id: string
  t: number
  x: number
}

/** The runs of a stretch, summarised the way every test reads them. */
export interface Level {
  /** Mean of the values, each clipped at the stretch's own median plus or minus `clip` spreads. */
  m: number
  /** Standard error of that mean. */
  se: number
  n: number
}

/** Runs with t in [lo, hi), by binary search on the runs sorted by t. */
export function slice(runs: readonly RunPoint[], lo: number, hi: number): RunPoint[] {
  let a = 0
  let b = runs.length
  while (a < b) {
    const m = (a + b) >> 1
    if (runs[m]!.t < lo) a = m + 1
    else b = m
  }
  const start = a
  b = runs.length
  while (a < b) {
    const m = (a + b) >> 1
    if (runs[m]!.t < hi) a = m + 1
    else b = m
  }
  return runs.slice(start, a)
}

/** Distinct calendar weeks the runs fall in; the runs are in time order, so it counts the changes of week. */
export function distinctWeeks(runs: readonly RunPoint[]): number {
  let weeks = 0
  let last = Number.NaN
  for (const r of runs) {
    const week = Math.floor(r.t / 7)
    if (week !== last) weeks++
    last = week
  }
  return weeks
}

/** The median of the runs' values (selection, not a sort: every test takes several medians a week). */
export function medianOf(runs: readonly RunPoint[]): number {
  const values = new Float64Array(runs.length)
  for (let i = 0; i < runs.length; i++) values[i] = runs[i]!.x
  return medianInPlace(values)
}

/** A normal-consistent spread that a few outliers cannot move: 1.4826 times the median absolute deviation. */
function robustSd(values: number[]): number {
  const centre = medianInPlace(Float64Array.from(values))
  return 1.4826 * medianInPlace(Float64Array.from(values, (v) => Math.abs(v - centre)))
}

const clip = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/**
 * The spread of one run against the next, from the changes between runs up to two weeks apart in the
 * last year: robust to the odd bad run, floored at 2%, and 4.5% before there are enough changes to say.
 */
export function sigmaAt(runs: readonly RunPoint[], day: number): number {
  const recent = slice(runs, day - M.sigmaWeeks * 7, day)
  const changes: number[] = []
  for (let i = 1; i < recent.length; i++) {
    if (recent[i]!.t - recent[i - 1]!.t <= M.sigmaGapDays)
      changes.push(recent[i]!.x - recent[i - 1]!.x)
  }
  if (changes.length < M.sigmaMinSteps) return M.sigmaPrior
  return Math.max(M.sigmaFloor, robustSd(changes) / Math.SQRT2)
}

/** The earlier level: the median of the runs from 44 to 8 weeks before `day`, or null without 12 runs over 8 weeks. */
export function referenceOf(
  runs: readonly RunPoint[],
  day: number,
): { mu: number; n: number } | null {
  const rs = slice(runs, day - M.refStartWeeks * 7, day - M.refEndWeeks * 7)
  if (rs.length < M.minRefRuns || distinctWeeks(rs) < M.minRefWeeks) return null
  return { mu: medianOf(rs), n: rs.length }
}

/** The level of a stretch of runs. `fallback` centres the clip when there are too few runs to have a median of their own. */
export function levelOf(rs: readonly RunPoint[], fallback: number, sigma: number): Level | null {
  if (rs.length === 0) return null
  const centre = rs.length >= 3 ? medianOf(rs) : fallback
  let sum = 0
  for (const r of rs) sum += clip(r.x, centre - M.clip * sigma, centre + M.clip * sigma)
  return { m: sum / rs.length, se: sigma / Math.sqrt(rs.length), n: rs.length }
}

export interface Slip {
  delta: number
  z: number
  fire: boolean
  /** The median of the baseline of the scale judged. */
  reference: number
  /** Weeks of the recent window of the scale judged. */
  weeks: number
}

/** The contrast of each scale (recent weeks against the weeks before them) in standard errors, for the scales that have the runs. */
function contrasts(runs: readonly RunPoint[], day: number, sigma: number) {
  const out: { delta: number; z: number; weeks: number; reference: number }[] = []
  for (const [recentWeeks, baseWeeks] of M.scales) {
    const recent = slice(runs, day - recentWeeks * 7, day)
    if (recent.length < M.minRecentRuns) continue
    const base = slice(runs, day - (recentWeeks + baseWeeks) * 7, day - recentWeeks * 7)
    if (base.length < M.minRefRuns || distinctWeeks(base) < M.minRefWeeks) continue
    const mu = medianOf(base)
    const a = levelOf(recent, mu, sigma)!
    const b = levelOf(base, mu, sigma)!
    const delta = a.m - b.m
    out.push({
      delta,
      z: delta / Math.sqrt(a.se ** 2 + b.se ** 2 + M.tau ** 2),
      weeks: recentWeeks,
      reference: mu,
    })
  }
  return out
}

/**
 * The slip test of one week. The scale with the lowest z is the one judged, and it fires when z is at
 * most -3.3 and the loss at least 4%.
 */
export function slipAt(runs: readonly RunPoint[], day: number, sigma: number): Slip | null {
  let best: Slip | null = null
  for (const c of contrasts(runs, day, sigma)) {
    if (best === null || c.z < best.z) {
      best = { ...c, fire: c.z <= -M.zSlip && c.delta <= -M.delta }
    }
  }
  return best
}

/**
 * Whether the level is clearly up on a week: the mirror of the slip test, at the same scales, z of at
 * least 3.3 and a gain of at least 4%. The status line asks it on two weeks running before it says
 * "improving"; there is no episode and no finding.
 */
export function risenAt(runs: readonly RunPoint[], day: number, sigma: number): boolean {
  let best: { delta: number; z: number } | null = null
  for (const c of contrasts(runs, day, sigma)) if (best === null || c.z > best.z) best = c
  return best !== null && best.z >= M.zSlip && best.delta >= M.delta
}

export interface Onset {
  /** The day the change is dated to. */
  day: number
  /** The median of the `onsetBaseWeeks` before it, which the episode is judged against from then on. */
  reference: number
  referenceRuns: number
}

/** Where a declared slip began: the split of the last 40 weeks that separates the runs after it from the 32 weeks before it most. */
export function locateOnset(runs: readonly RunPoint[], day: number, sigma: number): Onset | null {
  let best: (Onset & { z: number }) | null = null
  for (let k = M.onsetMinWeeks; k <= M.onsetMaxWeeks; k++) {
    const split = day - k * 7
    const after = slice(runs, split, day)
    const before = slice(runs, split - M.onsetBaseWeeks * 7, split)
    if (after.length < M.onsetMinAfter || before.length < M.minRefRuns) continue
    const mu = medianOf(before)
    const a = levelOf(after, mu, sigma)!
    const b = levelOf(before, mu, sigma)!
    const z = (a.m - b.m) / Math.sqrt(a.se ** 2 + b.se ** 2 + M.tau ** 2)
    if (best === null || z < best.z)
      best = { day: split, reference: mu, referenceRuns: before.length, z }
  }
  return best
}

/** The slope of the clipped values over the last `weeks`, as the change across the window, with its standard error. */
export function trendOver(
  runs: readonly RunPoint[],
  day: number,
  weeks: number,
  sigma: number,
  fromDay: number,
  minRuns: number,
  minWeeks: number,
): { change: number; se: number } | null {
  const lo = Math.max(day - weeks * 7, fromDay)
  const rs = slice(runs, lo, day)
  if (rs.length < minRuns || distinctWeeks(rs) < minWeeks) return null
  const centre = medianOf(rs)
  const t = rs.map((r) => (r.t - lo) / (day - lo))
  const y = rs.map((r) => clip(r.x, centre - M.clip * sigma, centre + M.clip * sigma))
  const mt = t.reduce((a, b) => a + b, 0) / t.length
  const my = y.reduce((a, b) => a + b, 0) / y.length
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < t.length; i++) {
    sxy += (t[i]! - mt) * (y[i]! - my)
    sxx += (t[i]! - mt) ** 2
  }
  if (!(sxx > 0)) return null
  return { change: sxy / sxx, se: Math.sqrt((sigma * sigma) / sxx + M.tau ** 2) }
}
