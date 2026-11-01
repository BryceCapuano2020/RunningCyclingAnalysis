import { LOOKBACK } from './params'

const S = LOOKBACK.segment

/** Prefix sums over the weeks (index `w` holds the weeks before `w`) from which a plateau's cost is made, and the spread it is in. */
export interface PlateauSums {
  sum: Float64Array
  squares: Float64Array
  /** The squared spread of one run: the unit the cost is in. */
  sigma2: number
}

/**
 * The squared deviation of the runs of the weeks `a` up to `b` from their mean, in squared run spreads. It is read from
 * the sums, not from a function passed in, so the search keeps one compiled form for every library it is asked of.
 */
export function plateauCost(count: Float64Array, sums: PlateauSums, a: number, b: number): number {
  return costBetween(count, sums.sum, sums.squares, sums.sigma2, a, b)
}

function costBetween(
  count: Float64Array,
  sum: Float64Array,
  squares: Float64Array,
  sigma2: number,
  a: number,
  b: number,
): number {
  const k = count[b]! - count[a]!
  if (k === 0) return 0
  const total = sum[b]! - sum[a]!
  return (squares[b]! - squares[a]! - (total * total) / k) / sigma2
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
  sums: PlateauSums,
  /** The size of the sums the costs are made of (the squares over the weeks, in squared run spreads), which bounds their rounding. */
  scale: number,
): { best: Float64Array; from: Int32Array } {
  const best = new Float64Array(weeks + 1).fill(Number.POSITIVE_INFINITY)
  const from = new Int32Array(weeks + 1).fill(-1)
  search(weeks, count, present, sums.sum, sums.squares, sums.sigma2, scale, best, from)
  return { best, from }
}

/**
 * The search, filling `best` and `from`. It hands back nothing: a loop compiled while the code after it has never run is
 * thrown away when it ends, and the next library would then run it slowly again until it was compiled once more.
 */
function search(
  weeks: number,
  count: Float64Array,
  present: Float64Array,
  sum: Float64Array,
  squares: Float64Array,
  sigma2: number,
  scale: number,
  best: Float64Array,
  from: Int32Array,
): void {
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
      const c = costBetween(count, sum, squares, sigma2, guess, b)
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
      const c = guess === a ? costs[a]! : costBetween(count, sum, squares, sigma2, a, b)
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
}
