import { indexOrder } from '../compare/indexOrder'
import { SAME_HEART_RATE } from '../constants'

/** The blocks of one fit: each has a heart rate, an output, and the activity (0 up) it came from. */
export interface FitBlocks {
  heartRate: Float64Array
  output: Float64Array
  owner: Uint16Array
  /** How many activities the blocks come from; owners run from 0 to one less. */
  activities: number
}

/** Output at a heart rate, with the ends of its interval, in the units of the blocks. */
export interface OutputAtHeartRate {
  output: number
  low: number
  high: number
}

/**
 * The slopes between every pair of blocks at different heart rates, in ascending order, with the
 * owners of each pair. `owner` holds each block's owner, and `tied` the owners of the pairs at the
 * same heart rate, which have no slope and so are left out.
 */
interface SortedSlopes {
  slope: Float64Array
  first: Uint16Array
  second: Uint16Array
  owner: Uint16Array
  tied: number[]
}

function sortedSlopes(blocks: FitBlocks): SortedSlopes {
  const { heartRate: x, output: y, owner } = blocks
  const n = x.length
  const slope = new Float64Array((n * (n - 1)) / 2)
  const first = new Uint16Array(slope.length)
  const second = new Uint16Array(slope.length)
  const tied: number[] = []
  let p = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[j]! - x[i]!
      if (dx === 0) {
        tied.push(owner[i]!, owner[j]!)
        continue
      }
      slope[p] = (y[j]! - y[i]!) / dx
      first[p] = owner[i]!
      second[p] = owner[j]!
      p++
    }
  }
  const order = indexOrder(slope, p, false)
  const sorted: SortedSlopes = {
    slope: new Float64Array(p),
    first: new Uint16Array(p),
    second: new Uint16Array(p),
    owner,
    tied,
  }
  for (let k = 0; k < p; k++) {
    const at = order[k]!
    sorted.slope[k] = slope[at]!
    sorted.first[k] = first[at]!
    sorted.second[k] = second[at]!
  }
  return sorted
}

/**
 * The weight of all the pairs when activity a is present counts[a] times: a pair weighs the product of
 * its owners' counts. Worked out from the blocks rather than by visiting the pairs.
 */
function totalWeight(pairs: SortedSlopes, counts: Float64Array): number {
  let sum = 0
  let squares = 0
  for (const owner of pairs.owner) {
    sum += counts[owner]!
    squares += counts[owner]! ** 2
  }
  let total = (sum * sum - squares) / 2
  for (let k = 0; k < pairs.tied.length; k += 2) {
    total -= counts[pairs.tied[k]!]! * counts[pairs.tied[k + 1]!]!
  }
  return total
}

/**
 * The median slope under those weights: with an even total weight, the mean of the two middle slopes,
 * as an unweighted median of an even number is. NaN when no pair is left.
 */
function weightedSlope(pairs: SortedSlopes, counts: Float64Array): number {
  const { slope, first, second } = pairs
  const total = totalWeight(pairs, counts)
  if (!(total > 0)) return Number.NaN
  // Weights are whole numbers, so the middle is the slope reaching `lower` and the one reaching `upper`.
  const lower = Math.ceil(total / 2)
  const upper = Math.floor(total / 2) + 1
  let running = 0
  let below = Number.NaN
  for (let k = 0; k < slope.length; k++) {
    running += counts[first[k]!]! * counts[second[k]!]!
    if (Number.isNaN(below) && running >= lower) below = slope[k]!
    if (running >= upper) return (below + slope[k]!) / 2
  }
  return Number.NaN
}

/** The values being ordered, reused between draws. It grows to the largest weight a resample has. */
interface Scratch {
  values: Float64Array
}

/**
 * The weighted median of the line's output at the reference heart rate, over the blocks: each block
 * counts as many times as its activity was drawn, and the median is the mean of the two middle values
 * when the weight is even.
 */
function weightedOutputAt(
  blocks: FitBlocks,
  counts: Float64Array,
  slope: number,
  referenceHr: number,
  scratch: Scratch,
): number {
  const { heartRate: x, output: y, owner } = blocks
  let total = 0
  for (let i = 0; i < x.length; i++) total += counts[owner[i]!]!
  if (scratch.values.length < total) scratch.values = new Float64Array(total * 2)
  let at = 0
  for (let i = 0; i < x.length; i++) {
    const value = y[i]! + slope * (referenceHr - x[i]!)
    for (let c = counts[owner[i]!]!; c > 0; c--) scratch.values[at++] = value
  }
  const present = scratch.values.subarray(0, total).sort()
  return (present[Math.ceil(total / 2) - 1]! + present[Math.floor(total / 2)]!) / 2
}

/**
 * The 95th percentile of Student's t for 1 to 30 degrees of freedom, which makes a two-sided 90%
 * interval. Beyond 30 it is 1.66, near the normal 1.645.
 */
const T_95 = [
  6.314, 2.92, 2.353, 2.132, 2.015, 1.943, 1.895, 1.86, 1.833, 1.812, 1.796, 1.782, 1.771, 1.761,
  1.753, 1.746, 1.74, 1.734, 1.729, 1.725, 1.721, 1.717, 1.714, 1.711, 1.708, 1.706, 1.703, 1.701,
  1.699, 1.697,
]

function tQuantile(degrees: number): number {
  return T_95[degrees - 1] ?? 1.66
}

/**
 * Output at referenceHr by Theil-Sen: the median of the pairwise slopes of output on heart rate, and
 * the median of what each block says the output is at referenceHr along that slope. The activities,
 * not the blocks, are resampled, since one activity's blocks share its day. A percentile interval of
 * the draws is too narrow with few activities (it covered about 80% of the time with four), so the
 * 90% interval is the output plus and minus the draws' standard deviation, taken as that of
 * `activities` clusters (scaled by the square root of n over n - 1) and read on Student's t with
 * activities - 1 degrees of freedom. The draws come from `random`. Null with fewer than two
 * activities, or when the blocks have no two heart rates apart.
 */
export function outputAtHeartRate(
  blocks: FitBlocks,
  referenceHr: number,
  random: () => number,
): OutputAtHeartRate | null {
  if (blocks.activities < 2) return null
  const pairs = sortedSlopes(blocks)
  const scratch: Scratch = { values: new Float64Array(blocks.heartRate.length * 2) }
  const once = new Float64Array(blocks.activities).fill(1)
  const slope = weightedSlope(pairs, once)
  if (Number.isNaN(slope)) return null
  const output = weightedOutputAt(blocks, once, slope, referenceHr, scratch)

  const counts = new Float64Array(blocks.activities)
  const draws: number[] = []
  for (let d = 0; d < SAME_HEART_RATE.draws; d++) {
    counts.fill(0)
    for (let a = 0; a < blocks.activities; a++) counts[Math.floor(random() * blocks.activities)]!++
    const drawSlope = weightedSlope(pairs, counts)
    if (Number.isNaN(drawSlope)) continue
    draws.push(weightedOutputAt(blocks, counts, drawSlope, referenceHr, scratch))
  }
  const n = blocks.activities
  const centre = draws.reduce((sum, v) => sum + v, 0) / draws.length
  const sd = Math.sqrt(draws.reduce((sum, v) => sum + (v - centre) ** 2, 0) / draws.length)
  const half = tQuantile(n - 1) * sd * Math.sqrt(n / (n - 1))
  return { output, low: output - half, high: output + half }
}
