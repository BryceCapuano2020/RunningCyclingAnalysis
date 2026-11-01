import { medianInPlace } from '../math'
import { floorAt, levelOf, slice } from '../fitness/windows'
import type { RunPoint } from '../fitness/windows'
import { bestSplit } from './anchors'
import { localMedians } from './localMedians'
import { partition } from './partition'
import type { Anchor } from './anchors'
import { LOOKBACK } from './params'

const S = LOOKBACK.segment

/** A stretch of weeks the steady runs held one level for: weeks since the origin (`fromWeek` inclusive, `toWeek` exclusive), the clipped mean of its runs in log units, its standard error and its run count. */
export interface Level {
  fromWeek: number
  toWeek: number
  m: number
  se: number
  n: number
  /** The level begins at a change the fitness card declared (a fall, or its return): judged by the card's bar, not the look-back's. */
  forced?: 'fall' | 'rise'
  /**
   * The level read without the weeks `card.guardWeeks` either side of a change the card declared. Where that change was put is
   * where the runs split best, which favours a bigger step than there is; the runs beside the cut that made it big are
   * left out when the step is judged (kept or merged, back or not), so a dip the card saw in noise is not confirmed by the
   * choosing of its date.
   */
  core?: { m: number; se: number }
}

/** What a step is judged on: the level without the weeks beside a change the card declared. */
export const coreOf = (level: Level): { m: number; se: number } => level.core ?? level

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
  let out = [...levels]
  for (;;) {
    let weakest = -1
    let weakness = Number.POSITIVE_INFINITY
    for (let i = 0; i + 1 < out.length; i++) {
      const [before, after] = [coreOf(out[i]!), coreOf(out[i + 1]!)]
      const step = after.m - before.m
      const forced = out[i + 1]!.forced
      // A change the card declared stands when the runs agree with its direction by the card's lower bar.
      const strength =
        forced !== undefined && (forced === 'fall') !== step > 0
          ? Math.min(
              Math.abs(step) / LOOKBACK.card.delta,
              Math.abs(stepZ(before, after, floor)) / LOOKBACK.card.z,
            )
          : forced !== undefined
            ? 0
            : Math.min(
                Math.abs(step) / bar.delta,
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
    out.splice(weakest, 2, a.forced === undefined ? merged : { ...merged, forced: a.forced })
    // The merge moved the cuts the later steps are judged beside: read the cores again from the levels as they stand.
    out = withCores(
      runs,
      sigma,
      out.map((level) =>
        level.core === undefined ? level : Object.assign({}, level, { core: undefined }),
      ),
    )
  }
}

/** A level can stand if it spans `minWeeks` and holds `minRuns` runs. */
const stands = (level: Level): boolean =>
  level.toWeek - level.fromWeek >= S.minWeeks && level.n >= S.minRuns

/** Each level beside a change the card declared, read again without the weeks next to that change (see `Level.core`). */
function withCores(runs: readonly RunPoint[], sigma: number, levels: Level[]): Level[] {
  const guard = LOOKBACK.card.guardWeeks
  return levels.map((level, i) => {
    const from = level.forced === undefined ? level.fromWeek : level.fromWeek + guard
    const to = levels[i + 1]?.forced === undefined ? level.toWeek : level.toWeek - guard
    if ((from === level.fromWeek && to === level.toWeek) || to - from < S.minWeeks) return level
    const core = levelBetween(runs, from, to, sigma)
    return core === null || core.n < S.minRuns
      ? level
      : { ...level, core: { m: core.m, se: core.se } }
  })
}

/**
 * The levels between `edges` (weeks, first and last included) with a cut added at each change the card declared. A cut of the
 * card's replaces any other within half a level's minimum span of it; a level too short or too thin to stand gives up its edge
 * (the other kind of edge first, then the later one), so the plateaus keep the rules the partition was made under.
 */
function cutAt(
  runs: readonly RunPoint[],
  sigma: number,
  edges: readonly number[],
  cards: readonly { week: number; dir: 'fall' | 'rise' }[],
): Level[] {
  const last = edges.at(-1)!
  const cut = new Map<number, 'fall' | 'rise' | undefined>(edges.map((e) => [e, undefined]))
  for (const { week, dir } of cards) {
    if (week <= edges[0]! + S.minWeeks || week >= last - S.minWeeks) continue
    for (const e of [...cut.keys()]) {
      if (e !== edges[0] && e !== last && Math.abs(e - week) < S.minWeeks / 2) cut.delete(e)
    }
    cut.set(week, dir)
  }
  for (;;) {
    const weeks = [...cut.keys()].sort((a, b) => a - b)
    const levels = weeks.slice(0, -1).flatMap((w, i) => {
      const level = levelBetween(runs, w, weeks[i + 1]!, sigma)
      const forced = cut.get(w)
      return level === null ? [] : [forced === undefined ? level : { ...level, forced }]
    })
    const thin = levels.findIndex((level) => !stands(level))
    if (thin < 0 || levels.length < 2) return withCores(runs, sigma, levels)
    // Give up the edge that is not the card's, else the later one.
    const [left, right] = [levels[thin]!.fromWeek, levels[thin]!.toWeek]
    const drop =
      thin === 0
        ? right
        : thin === levels.length - 1
          ? left
          : cut.get(left) === undefined
            ? left
            : right
    cut.delete(drop)
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
  anchors: readonly Anchor[] = [],
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
  const levels = cutAt(
    own,
    sigma,
    edges.map((e) => e + first),
    anchors.flatMap((a) => {
      const week = bestSplit(own, a, sigma, first)
      return week === null ? [] : [{ week, dir: a.dir }]
    }),
  )
  return { levels: mergeLevels(levels, own, sigma, floor, bar, maxLevels), sigma, floor }
}
