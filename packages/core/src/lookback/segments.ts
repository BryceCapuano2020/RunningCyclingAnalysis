import { madSd, medianInPlace } from '../math'
import { floorAt, levelOf, slice } from '../fitness/windows'
import type { RunPoint } from '../fitness/windows'
import { localMedians } from './localMedians'
import { partition } from './partition'
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
  return { sigma: Math.max(S.sigmaFloor, madSd(changes) / Math.SQRT2), changes: changes.length }
}

/**
 * The model-error floor over the whole library: D2's `floorAt`, read at steps of `floorStepWeeks` back from the end
 * and the median taken, never under `tau`. The median, not the maximum: in a window that holds most of a long dip the
 * maximum reads the dip as wander, and the dip is then never found.
 */
function floorOver(runs: readonly RunPoint[], endDay: number, sigma: number): number {
  const first = runs[0]?.t ?? endDay
  const floors: number[] = []
  for (let day = endDay; day >= first; day -= S.floorStepWeeks * 7) {
    floors.push(floorAt(runs, day, sigma))
  }
  return Math.max(S.tau, medianInPlace(Float64Array.from(floors)))
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
export const stepZ = (
  a: { m: number; se: number },
  b: { m: number; se: number },
  floor: number,
): number => (b.m - a.m) / Math.sqrt(a.se ** 2 + b.se ** 2 + floor ** 2)

/** How firmly the step from level `i` to the next stands: under 1 it is merged. */
function strengthOf(
  levels: readonly Level[],
  i: number,
  floor: number,
  bar: { delta: number; z: number },
): number {
  const [before, after] = [levels[i]!, levels[i + 1]!]
  return Math.min(
    Math.abs(after.m - before.m) / bar.delta,
    Math.abs(stepZ(before, after, floor)) / bar.z,
  )
}

/**
 * Merges neighbours, weakest first, while a step is under `delta` or under `z` standard errors, or (with `maxLevels`) while
 * there are more levels than that. A level is re-read from the runs of both.
 */
function mergeLevels(
  levels: Level[],
  runs: readonly RunPoint[],
  sigma: number,
  floor: number,
  bar: { delta: number; z: number },
  maxLevels = Number.POSITIVE_INFINITY,
): Level[] {
  let out = [...levels]
  for (;;) {
    const weak = out
      .slice(1)
      .map((_, i) => ({ i, strength: strengthOf(out, i, floor, bar) }))
      .filter((c) => c.strength < 1 || out.length > maxLevels)
      .sort((x, y) => x.strength - y.strength || x.i - y.i)
    const first = weak[0]
    if (first === undefined) return out
    const [a, b] = [out[first.i]!, out[first.i + 1]!]
    const merged = levelBetween(runs, a.fromWeek, b.toWeek, sigma)
    if (merged === null) return out
    out = [...out.slice(0, first.i), merged, ...out.slice(first.i + 2)]
  }
}

/** A level can stand if it spans `minWeeks` and holds `minRuns` runs. */
const stands = (level: Level): boolean =>
  level.toWeek - level.fromWeek >= S.minWeeks && level.n >= S.minRuns

/**
 * The levels between `edges` (weeks, first and last included). A level too short or too thin to stand gives up its
 * edge (the later one for the first level, the earlier one otherwise), so the plateaus keep the rules the partition was made under.
 */
function levelsBetween(
  runs: readonly RunPoint[],
  sigma: number,
  edges: readonly number[],
): Level[] {
  const cut = [...edges]
  for (;;) {
    const levels = cut.slice(0, -1).flatMap((w, i) => {
      const level = levelBetween(runs, w, cut[i + 1]!, sigma)
      return level === null ? [] : [level]
    })
    const thin = levels.findIndex((level) => !stands(level))
    if (thin < 0 || levels.length < 2) return levels
    cut.splice(cut.indexOf(thin === 0 ? levels[thin]!.toWeek : levels[thin]!.fromWeek), 1)
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
  let lastWeek = -1
  for (const r of own) {
    const w = Math.floor(r.t / 7) - first
    if (w < 0 || w >= weeks) continue
    const centre = medianNear(w + first)
    const x = Math.min(centre + S.clip * sigma, Math.max(centre - S.clip * sigma, r.x))
    count[w + 1]! += 1
    sum[w + 1]! += x
    squares[w + 1]! += x * x
    // The runs are in time order, so a week's runs come together.
    if (w !== lastWeek) {
      lastWeek = w
      present[w + 1]! += 1
    }
  }
  for (let i = 1; i <= weeks; i++) {
    count[i]! += count[i - 1]!
    sum[i]! += sum[i - 1]!
    squares[i]! += squares[i - 1]!
    present[i]! += present[i - 1]!
  }
  const sigma2 = sigma * sigma
  const { best, from } = partition(
    weeks,
    count,
    present,
    { sum, squares, sigma2 },
    squares[weeks]! / sigma2,
  )
  if (best[weeks] === Number.POSITIVE_INFINITY) return null
  const edges = [weeks]
  for (let b = weeks; from[b]! > 0; b = from[b]!) edges.unshift(from[b]!)
  edges.unshift(0)
  const levels = levelsBetween(
    own,
    sigma,
    edges.map((e) => e + first),
  )
  return { levels: mergeLevels(levels, own, sigma, floor, bar, maxLevels), sigma, floor }
}
