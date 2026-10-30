import { mulberry32, quantile } from '../../math'
import type { Sport } from '../../types'
import { DEFAULT_ATHLETE } from '../athlete'
import { generateActivity } from '../generate'
import { SPLIT_HALF_EFFORTS } from './realism'
import type { NoiseModel } from './types'

/** Held test windows: a 20-minute run best and a 5-minute ride best, and the shortest activity holding each. */
const WINDOWS = {
  run: { durationS: 5200, from: 3960, to: 5160 },
  ride: { durationS: 2100, from: 1680, to: 2040 },
} as const

/**
 * The split-half statistic measured on generated activities: `pool` equal-capability test
 * activities, the mean over the held window of each, then `draws` pairs of halves of
 * SPLIT_HALF_EFFORTS bests drawn with replacement. A finite pool adds sampling noise, so the full
 * check (a pool of 1000) runs in the sims job.
 */
export function generatedSplitHalf(
  noise: NoiseModel,
  sport: Sport,
  pool: number,
  draws: number,
): number {
  const { durationS, from, to } = WINDOWS[sport]
  const bests = Array.from({ length: pool }, (_, k) => {
    const a = generateActivity(
      DEFAULT_ATHLETE,
      { id: 'b', name: 'B', sport, startMs: 0, durationS, effort: 'test', terrain: 'flat' },
      (k + 1) * 7919 + 13,
      noise,
    )
    const xs = sport === 'run' ? a.speed : a.power
    let sum = 0
    for (let i = from; i < to; i++) sum += xs[i]!
    return sum / (to - from)
  })
  const rand = mulberry32(11)
  const half = () => {
    let top = 0
    for (let k = 0; k < SPLIT_HALF_EFFORTS; k++)
      top = Math.max(top, bests[Math.floor(rand() * pool)]!)
    return top
  }
  return quantile(
    Array.from({ length: draws }, () => Math.abs(Math.log(half() / half()))),
    0.5,
  )
}
