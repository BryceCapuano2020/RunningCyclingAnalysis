import { SAME_HEART_RATE } from '../constants'
import { quantile } from '../math'

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
  const order = new Uint32Array(p)
  for (let k = 0; k < p; k++) order[k] = k
  order.sort((a, b) => slope[a]! - slope[b]!)
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

/** The median slope under those weights. NaN when no pair is left. */
function weightedSlope(pairs: SortedSlopes, counts: Float64Array): number {
  const { slope, first, second } = pairs
  const half = totalWeight(pairs, counts) / 2
  if (!(half > 0)) return Number.NaN
  let running = 0
  for (let k = 0; k < slope.length; k++) {
    running += counts[first[k]!]! * counts[second[k]!]!
    if (running >= half) return slope[k]!
  }
  return Number.NaN
}

/** The values being ordered, reused between draws. It grows to the largest weight a resample has. */
interface Scratch {
  values: Float64Array
}

/**
 * The weighted median of the line's output at the reference heart rate, over the blocks: each block
 * counts as many times as its activity was drawn, and the median is the first value at which half the
 * weight is reached.
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
  return present[Math.ceil(total / 2) - 1]!
}

/**
 * Output at referenceHr by Theil-Sen: the median of the pairwise slopes of output on heart rate, and
 * the median of what each block says the output is at referenceHr along that slope. The interval
 * resamples the activities, not the blocks, since one activity's blocks share its day. The draws come
 * from `random`. Null when the blocks have no two heart rates apart.
 */
export function outputAtHeartRate(
  blocks: FitBlocks,
  referenceHr: number,
  random: () => number,
): OutputAtHeartRate | null {
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
  const tail = (1 - SAME_HEART_RATE.intervalLevel) / 2
  return { output, low: quantile(draws, tail), high: quantile(draws, 1 - tail) }
}
