import { mulberry32, quantileSorted } from '../math'
import { CHANGE } from './constants'

/** The band the ln ratio of two periods' bests falls in when their efforts are dealt out at random. */
export interface NullBand {
  /** The 5th and 95th percentile: the record band. */
  low: number
  high: number
  /** The 2.5th and 97.5th: the headline band. */
  strongLow: number
  strongHigh: number
}

/**
 * The ln ratio of the best of the "now" side to the best of the "before" side, for one random deal of the pooled
 * efforts (sorted from the highest down, positive).
 *
 * A balanced deal walks the pool from the top, each effort going to a side with probability its share of the places
 * left, until both sides have appeared: exact, and a few steps. A deal with a small side of `s` efforts chooses its `s`
 * ranks instead (Floyd's sample of distinct ranks), takes the best of the small side as the lowest rank chosen and the
 * large side's best as the first rank not chosen: exact too, and O(s), so 400 efforts against 4 costs 4 draws, not a walk.
 */
function dealOnce(pooled: Float64Array, now: number, random: () => number, share: number): number {
  const n = pooled.length
  const before = n - now
  const small = Math.min(now, before)
  if (small < n * share) {
    const chosen = new Set<number>()
    let lowest = n
    for (let j = n - small; j < n; j++) {
      const t = Math.floor(random() * (j + 1))
      const rank = chosen.has(t) ? j : t
      chosen.add(rank)
      if (rank < lowest) lowest = rank
    }
    let free = 0
    while (chosen.has(free)) free++
    const [bestSmall, bestLarge] = [pooled[lowest]!, pooled[free]!]
    return now <= before ? Math.log(bestSmall / bestLarge) : Math.log(bestLarge / bestSmall)
  }
  let a = now
  let b = before
  let bestNow = Number.NaN
  let bestBefore = Number.NaN
  for (let i = 0; i < n; i++) {
    if (random() * (a + b) < a) {
      a--
      if (Number.isNaN(bestNow)) bestNow = pooled[i]!
    } else {
      b--
      if (Number.isNaN(bestBefore)) bestBefore = pooled[i]!
    }
    if (!Number.isNaN(bestNow) && !Number.isNaN(bestBefore)) break
  }
  return Math.log(bestNow / bestBefore)
}

/** The sorted-or-not ln ratios of `draws` deals; `share` is the small-side share below which Floyd's sample is used (tests force either path). */
export function dealRatios(
  pooled: Float64Array,
  now: number,
  seed: number,
  draws: number,
  share: number,
): Float64Array {
  const random = mulberry32(seed)
  const ratios = new Float64Array(draws)
  for (let draw = 0; draw < draws; draw++) ratios[draw] = dealOnce(pooled, now, random, share)
  return ratios
}

/**
 * The bands the ln ratio of two periods' bests falls in when their efforts are dealt out at random: `now` efforts to
 * the later period and the rest to the earlier (see dealOnce).
 *
 * `pooled` is sorted from the highest effort down and positive. Null when either side has no effort.
 */
export function nullBand(pooled: Float64Array, now: number, seed: number): NullBand | null {
  if (now < 1 || pooled.length - now < 1) return null
  const ratios = dealRatios(pooled, now, seed, CHANGE.draws, CHANGE.unbalancedShare)
  ratios.sort()
  return {
    low: quantileSorted(ratios, CHANGE.tail),
    high: quantileSorted(ratios, 1 - CHANGE.tail),
    strongLow: quantileSorted(ratios, CHANGE.strongTail),
    strongHigh: quantileSorted(ratios, 1 - CHANGE.strongTail),
  }
}
