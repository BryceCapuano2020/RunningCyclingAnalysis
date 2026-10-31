import { medianInPlace } from '../math'
import { floorAt, levelOf, slice } from '../fitness/windows'
import type { RunPoint } from '../fitness/windows'
import { bestSplit } from './anchors'
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

/**
 * The median of the runs within `clipWeeks` weeks of each week, kept so a run is clipped against the weeks round it. The
 * weeks are asked for in order, so the runs in reach are kept sorted as the window moves along, a run entering at one end and
 * leaving at the other, not collected and selected again for every week; a week asked for out of order is worked out from
 * its own runs. Either way it is the median `medianInPlace` gives.
 */
export function localMedians(runs: readonly RunPoint[]): (week: number) => number {
  const cache = new Map<number, number>()
  const window: number[] = []
  let from = 0
  let to = 0
  let latest = Number.NEGATIVE_INFINITY
  /** The index at which `x` is, or would go, among the sorted values. */
  const place = (x: number): number => {
    let lo = 0
    let hi = window.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (window[mid]! < x) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const medianOfWindow = (): number => {
    const n = window.length
    if (n === 0) return 0
    const low = (n - 1) >> 1
    if (n % 2 === 1) return window[low]!
    return window[low]! + (window[low + 1]! - window[low]!) * 0.5
  }
  return (week) => {
    let median = cache.get(week)
    if (median === undefined) {
      const [lo, hi] = [(week - S.clipWeeks) * 7, (week + S.clipWeeks + 1) * 7]
      if (week < latest) {
        const near = slice(runs, lo, hi)
        median = near.length === 0 ? 0 : medianInPlace(Float64Array.from(near, (r) => r.x))
      } else {
        latest = week
        while (to < runs.length && runs[to]!.t < hi) {
          const x = runs[to]!.x
          window.splice(place(x), 0, x)
          to++
        }
        while (from < to && runs[from]!.t < lo) {
          window.splice(place(runs[from]!.x), 1)
          from++
        }
        median = medianOfWindow()
      }
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
 * The cheapest cut of the weeks into plateaus: `best[b]` is the least total cost of cutting the first `b` weeks (each
 * plateau its `cost` plus `beta`), `from[b]` where the last plateau begins. A plateau spans `minWeeks` and holds `minRuns`
 * runs over `minDistinctWeeks` weeks.
 *
 * Every start is a candidate for every end, but most are left unpriced, by two bounds that rest on one fact, that a
 * plateau's cost never falls when it is made longer or is split (the sum of squares about the mean is least about the
 * mean of each part). A start priced at one end costs at least that at every later end, so while that is more than the
 * best cut found for this end, it is left alone (`last`). And a start that, ending at `t`, already costs more than the best
 * cut of the first `t` weeks is beaten by starting at `t` for every end where a plateau from `t` is allowed, so it is
 * dropped for good (`beaten`, as PELT does). A start is left out only when it is worse by more than rounding could
 * make it, and the rest are priced in the same order with the same sums, so the cut is the one the full search makes.
 */
export function partition(
  weeks: number,
  count: Float64Array,
  present: Float64Array,
  cost: (a: number, b: number) => number,
  /** The size of the sums the costs are made of (the squares over the weeks, in squared run spreads), which bounds their rounding. */
  scale: number,
): { best: Float64Array; from: Int32Array } {
  const best = new Float64Array(weeks + 1).fill(Number.POSITIVE_INFINITY)
  const from = new Int32Array(weeks + 1).fill(-1)
  const { minWeeks, minRuns, minDistinctWeeks, beta } = S
  best[0] = -beta
  // The starts still in play, in order; the first end each was found beaten at; the value each last cost.
  const live = new Int32Array(weeks + 1)
  const beaten = new Int32Array(weeks + 1).fill(-1)
  const last = new Float64Array(weeks + 1).fill(Number.NEGATIVE_INFINITY)
  const tried = new Int32Array(weeks + 1)
  const costs = new Float64Array(weeks + 1)
  let liveCount = 0
  live[liveCount++] = 0
  for (let b = minWeeks; b <= weeks; b++) {
    const countB = count[b]!
    const presentB = present[b]!
    // The start that won the end before is the likeliest to win this one: its value bounds the best from above.
    const guess = from[b - 1]!
    let bound = Number.POSITIVE_INFINITY
    if (
      guess >= 0 &&
      b - guess >= minWeeks &&
      countB - count[guess]! >= minRuns &&
      presentB - present[guess]! >= minDistinctWeeks
    ) {
      const c = cost(guess, b)
      bound = best[guess]! + c + beta
      costs[guess] = c
      last[guess] = bound
    }
    const slack = 1e-10 * (1 + Math.abs(bound) + scale)
    let kept = 0
    let triedCount = 0
    let bestB = Number.POSITIVE_INFINITY
    let fromB = -1
    for (let i = 0; i < liveCount; i++) {
      const a = live[i]!
      if (a + minWeeks > b) {
        live[kept++] = a
        continue
      }
      // Beaten by a start that is allowed for this end and every later one: out for good.
      const over = beaten[a]!
      if (
        over >= 0 &&
        b - over >= minWeeks &&
        countB - count[over]! >= minRuns &&
        presentB - present[over]! >= minDistinctWeeks
      ) {
        continue
      }
      live[kept++] = a
      if (countB - count[a]! < minRuns || presentB - present[a]! < minDistinctWeeks) continue
      // It cost more than the best cut when last priced, and a plateau only costs more as it grows.
      if (last[a]! > bound + slack) continue
      const c = guess === a ? costs[a]! : cost(a, b)
      costs[a] = c
      tried[triedCount++] = a
      const value = best[a]! + c + beta
      last[a] = value
      if (value < bound) bound = value
      if (value < bestB) {
        bestB = value
        fromB = a
      }
    }
    liveCount = kept
    if (fromB < 0) continue
    best[b] = bestB
    from[b] = fromB
    // What beginning at each priced start cost to end here, against the best cut of these weeks.
    const margin = 1e-10 * (1 + Math.abs(bestB) + scale)
    for (let i = 0; i < triedCount; i++) {
      const a = tried[i]!
      if (beaten[a]! < 0 && best[a]! + costs[a]! > bestB + margin) beaten[a] = b
    }
    live[liveCount++] = b
  }
  return { best, from }
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
  const cost = (a: number, b: number): number => {
    const k = count[b]! - count[a]!
    if (k === 0) return 0
    const total = sum[b]! - sum[a]!
    return (squares[b]! - squares[a]! - (total * total) / k) / (sigma * sigma)
  }
  const { best, from } = partition(weeks, count, present, cost, squares[weeks]! / (sigma * sigma))
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
