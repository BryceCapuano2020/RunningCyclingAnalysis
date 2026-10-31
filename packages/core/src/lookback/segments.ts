import { medianInPlace } from '../math'
import { floorAt, levelOf, slice } from '../fitness/windows'
import type { RunPoint } from '../fitness/windows'
import { LOOKBACK } from './params'

const S = LOOKBACK.segment

/** A stretch of weeks the steady runs held one level for: weeks since the origin (`fromWeek` inclusive, `toWeek` exclusive), the clipped mean of its runs in log units, its standard error and its run count. */
export interface Level {
  fromWeek: number
  toWeek: number
  m: number
  se: number
  n: number
}

export interface Segmented {
  levels: Level[]
  /** The spread of one run against the next, over the whole library. */
  sigma: number
  /** The floor every comparison of plateaus is made against. */
  floor: number
}

const robustSd = (values: number[]): number => {
  const centre = medianInPlace(Float64Array.from(values))
  return 1.4826 * medianInPlace(Float64Array.from(values, (v) => Math.abs(v - centre)))
}

/**
 * The spread of one run against the next, from the changes between runs up to two weeks apart over the whole
 * library (the monitor's estimator, over all of it rather than the last year, so a change of watch late in the
 * years does not set the bar for the early ones). NaN with too few changes to say.
 */
export function sigmaOver(runs: readonly RunPoint[]): { sigma: number; changes: number } {
  const changes: number[] = []
  for (let i = 1; i < runs.length; i++) {
    if (runs[i]!.t - runs[i - 1]!.t <= S.sigmaGapDays) changes.push(runs[i]!.x - runs[i - 1]!.x)
  }
  if (changes.length === 0) return { sigma: Number.NaN, changes: 0 }
  return { sigma: Math.max(S.sigmaFloor, robustSd(changes) / Math.SQRT2), changes: changes.length }
}

/**
 * The model-error floor over the whole library: D2's `floorAt`, read at steps of `floorStepWeeks` back from the end
 * and the median taken, never under `tau`. The median, not the maximum: in a window that holds most of a long dip the
 * maximum reads the dip as wander, and the dip is then never found.
 */
export function floorOver(runs: readonly RunPoint[], endDay: number, sigma: number): number {
  const first = runs[0]?.t ?? endDay
  const floors: number[] = []
  for (let day = endDay; day >= first; day -= S.floorStepWeeks * 7) {
    floors.push(floorAt(runs, day, sigma))
  }
  return Math.max(S.tau, medianInPlace(Float64Array.from(floors)))
}

/** The median of the runs within `clipWeeks` weeks of each week, kept so a run is clipped against the weeks round it. */
function localMedians(runs: readonly RunPoint[]): (week: number) => number {
  const cache = new Map<number, number>()
  return (week) => {
    let median = cache.get(week)
    if (median === undefined) {
      const near = slice(runs, (week - S.clipWeeks) * 7, (week + S.clipWeeks + 1) * 7)
      median = near.length === 0 ? 0 : medianInPlace(Float64Array.from(near, (r) => r.x))
      cache.set(week, median)
    }
    return median
  }
}

const levelBetween = (
  runs: readonly RunPoint[],
  fromWeek: number,
  toWeek: number,
  sigma: number,
): Level | null => {
  const rs = slice(runs, fromWeek * 7, toWeek * 7)
  if (rs.length === 0) return null
  const level = levelOf(rs, medianInPlace(Float64Array.from(rs, (r) => r.x)), sigma)!
  return { fromWeek, toWeek, m: level.m, se: level.se, n: level.n }
}

/** The z of the step from one level to the next against the floor. */
export const stepZ = (a: Level, b: Level, floor: number): number =>
  (b.m - a.m) / Math.sqrt(a.se ** 2 + b.se ** 2 + floor ** 2)

/**
 * Merges neighbours, weakest first, while a step is under `delta` or under `z` standard errors, or (with `maxLevels`) while
 * there are more levels than that. A level is re-read from the runs of both.
 */
export function mergeLevels(
  levels: Level[],
  runs: readonly RunPoint[],
  sigma: number,
  floor: number,
  bar: { delta: number; z: number },
  maxLevels = Number.POSITIVE_INFINITY,
): Level[] {
  const out = [...levels]
  for (;;) {
    let weakest = -1
    let weakness = Number.POSITIVE_INFINITY
    for (let i = 0; i + 1 < out.length; i++) {
      const strength = Math.min(
        Math.abs(out[i + 1]!.m - out[i]!.m) / bar.delta,
        Math.abs(stepZ(out[i]!, out[i + 1]!, floor)) / bar.z,
      )
      if ((strength < 1 || out.length > maxLevels) && strength < weakness) {
        weakness = strength
        weakest = i
      }
    }
    if (weakest < 0) return out
    const a = out[weakest]!
    const b = out[weakest + 1]!
    const merged = levelBetween(runs, a.fromWeek, b.toWeek, sigma)
    if (merged === null) return out
    out.splice(weakest, 2, merged)
  }
}

/**
 * The steady-run series (sorted by t, up to `endDay`) cut into plateaus by optimal partitioning over weekly buckets: the
 * cost of a plateau is the squared deviation of its runs from their mean in squared run spreads, each further plateau
 * costs `beta`, and a plateau spans at least 8 weeks and holds at least 12 runs over 8 distinct weeks. Neighbours whose
 * step is not clear of the floor, or under `delta`, are then merged. Optimal partitioning, not binary segmentation,
 * because a dip that comes back has no single split that explains it. Null with nothing to cut.
 */
export function segmentLevels(
  runs: readonly RunPoint[],
  endDay: number,
  bar: { delta: number; z: number },
  maxLevels: number = LOOKBACK.caps.levels,
): Segmented | null {
  const own = slice(runs, Number.NEGATIVE_INFINITY, endDay)
  if (own.length === 0) return null
  const { sigma } = sigmaOver(own)
  if (!Number.isFinite(sigma)) return null
  const floor = floorOver(own, endDay, sigma)
  const first = Math.floor(own[0]!.t / 7)
  const weeks = Math.ceil(endDay / 7) - first
  const medianNear = localMedians(own)
  // Prefix sums over weeks of the count, the clipped values, their squares and the weeks that hold a run.
  const count = new Float64Array(weeks + 1)
  const sum = new Float64Array(weeks + 1)
  const squares = new Float64Array(weeks + 1)
  const present = new Float64Array(weeks + 1)
  const seen = new Set<number>()
  for (const r of own) {
    const w = Math.floor(r.t / 7) - first
    if (w < 0 || w >= weeks) continue
    const centre = medianNear(w + first)
    const x = Math.min(centre + S.clip * sigma, Math.max(centre - S.clip * sigma, r.x))
    count[w + 1]! += 1
    sum[w + 1]! += x
    squares[w + 1]! += x * x
    if (!seen.has(w)) {
      seen.add(w)
      present[w + 1]! += 1
    }
  }
  for (let i = 1; i <= weeks; i++) {
    count[i]! += count[i - 1]!
    sum[i]! += sum[i - 1]!
    squares[i]! += squares[i - 1]!
    present[i]! += present[i - 1]!
  }
  const cost = (a: number, b: number): number => {
    const k = count[b]! - count[a]!
    if (k === 0) return 0
    const total = sum[b]! - sum[a]!
    return (squares[b]! - squares[a]! - (total * total) / k) / (sigma * sigma)
  }
  const best = new Float64Array(weeks + 1).fill(Number.POSITIVE_INFINITY)
  const from = new Int32Array(weeks + 1).fill(-1)
  best[0] = -S.beta
  for (let b = S.minWeeks; b <= weeks; b++) {
    for (let a = 0; a + S.minWeeks <= b; a++) {
      if (best[a] === Number.POSITIVE_INFINITY) continue
      if (count[b]! - count[a]! < S.minRuns || present[b]! - present[a]! < S.minDistinctWeeks)
        continue
      const value = best[a]! + cost(a, b) + S.beta
      if (value < best[b]!) {
        best[b] = value
        from[b] = a
      }
    }
  }
  if (best[weeks] === Number.POSITIVE_INFINITY) return null
  const edges = [weeks]
  for (let b = weeks; from[b]! > 0; b = from[b]!) edges.unshift(from[b]!)
  edges.unshift(0)
  const levels: Level[] = []
  for (let i = 0; i + 1 < edges.length; i++) {
    const level = levelBetween(own, edges[i]! + first, edges[i + 1]! + first, sigma)
    if (level !== null) levels.push(level)
  }
  return { levels: mergeLevels(levels, own, sigma, floor, bar, maxLevels), sigma, floor }
}
