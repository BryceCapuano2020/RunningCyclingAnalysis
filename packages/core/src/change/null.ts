import { mulberry32, quantileSorted } from '../math'
import { CHANGE } from './constants'

/**
 * The band the ln ratio of two periods' bests falls in when their efforts are dealt out at random: `now`
 * efforts to the later period and the rest to the earlier. Draws are exact for the best of each side: the
 * pooled efforts are walked from the highest down, each going to a side with probability its share of the
 * places left, until both sides have appeared, so a draw costs a few steps and nothing is sorted or shuffled.
 *
 * `pooled` is sorted from the highest effort down and positive. Null when either side has no effort.
 */
export function nullBand(
  pooled: Float64Array,
  now: number,
  seed: number,
): { low: number; high: number } | null {
  const before = pooled.length - now
  if (now < 1 || before < 1) return null
  const random = mulberry32(seed)
  const ratios = new Float64Array(CHANGE.draws)
  for (let draw = 0; draw < CHANGE.draws; draw++) {
    let a = now
    let b = before
    let bestNow = Number.NaN
    let bestBefore = Number.NaN
    for (let i = 0; i < pooled.length; i++) {
      const toNow = random() * (a + b) < a
      if (toNow) {
        a--
        if (Number.isNaN(bestNow)) bestNow = pooled[i]!
      } else {
        b--
        if (Number.isNaN(bestBefore)) bestBefore = pooled[i]!
      }
      if (!Number.isNaN(bestNow) && !Number.isNaN(bestBefore)) break
    }
    ratios[draw] = Math.log(bestNow / bestBefore)
  }
  ratios.sort()
  return {
    low: quantileSorted(ratios, CHANGE.tail),
    high: quantileSorted(ratios, 1 - CHANGE.tail),
  }
}
