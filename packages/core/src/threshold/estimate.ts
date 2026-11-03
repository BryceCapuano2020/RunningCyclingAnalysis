import { fuse } from './fusion'
import { heartBasis, heartOver } from './heartRateEstimate'
import type { HeartBasis, HeartRateEstimate } from './heartRateEstimate'
import { lineOf } from './heartRateLine'
import type { HeartRateLine } from './heartRateLine'
import { powerOver } from './powerEstimate'
import { prepareFlat } from './rides'
import type { PreparedRide } from './rides'
import type { HeartRateRefusal, ThresholdBlock, ThresholdEffort, ThresholdEstimate } from './types'

/** The heart-rate line of a set of rides, or why there is none. Fitted once for the set; every window of it reads this. */
export type RideLine = HeartRateLine | { refused: HeartRateRefusal }

/**
 * The line of a set of rides, fitted once: the slope within rides, each ride's offset, and the rides left out as stuck or
 * far off the pooled offset, from all the power-meter rides' blocks (the blocks between 45% and 105% of the set's power
 * estimate). A window of the set reads it rather than fitting its own: fitting it is the cost of the estimate, and a window of
 * a few weeks has too few blocks to fit one as well as the set does. `ages` are the rides' days back from the newest activity.
 */
export function fitRideLine(rides: readonly PreparedRide[], ages: ArrayLike<number>): RideLine {
  const power = powerOver(rides, ages)
  const blocks = rides.flatMap((ride) => ride.blocks)
  if (power === null || blocks.length === 0) return { refused: 'no-heart-rate' }
  return lineOf(blocks, power.value)
}

/**
 * A set of rides read against a line and a threshold heart rate (the caller's 90% of the sport's reference maximum, or
 * null): everything about the set a window needs that does not depend on the window. `estimateOver` takes a window of it.
 */
export interface ThresholdBasis {
  rides: readonly PreparedRide[]
  /** The line's refusal, or that there is no threshold heart rate, when heart rate cannot be read; else what it reads against. */
  heart: HeartBasis | { refused: HeartRateRefusal }
}

export function thresholdBasis(
  rides: readonly PreparedRide[],
  line: RideLine,
  thresholdHr: number | null,
): ThresholdBasis {
  if (thresholdHr === null || !(thresholdHr > 0))
    return { rides, heart: { refused: 'no-heart-rate' } }
  if ('refused' in line) return { rides, heart: line }
  return { rides, heart: heartBasis(rides, line, thresholdHr) }
}

/**
 * The ride threshold over the rides of a basis from `lo` up to, not including, `hi` (a window of the set, in time order, or all
 * of it), each aged by `ages` (days back from the newest activity of the window). Null where no ride in it has an effort of
 * 3 min or more, or none has any weight. The power estimate is a floor; heart rate is a second estimate that can lift the
 * answer and never lowers it (docs/design/threshold.md).
 */
export function estimateOver(
  basis: ThresholdBasis,
  ages: ArrayLike<number>,
  lo = 0,
  hi = basis.rides.length,
): ThresholdEstimate | null {
  const power = powerOver(basis.rides, ages, lo, hi)
  if (power === null) return null
  const heart: HeartRateEstimate | { refused: HeartRateRefusal } =
    'refused' in basis.heart ? basis.heart : heartOver(basis.heart, ages, power.value, lo, hi)
  const fused = fuse(power.value, power.relativeError, 'refused' in heart ? null : heart)
  return {
    value: fused.value,
    low: fused.low,
    high: fused.high,
    efforts: {
      value: power.value,
      relativeError: power.relativeError,
      rides: power.rides,
      strongest: power.strongest,
    },
    heartRate: 'refused' in heart ? heart : { value: heart.value, efforts: heart.efforts },
  }
}

/**
 * The ride threshold from every effort in one window (docs/design/threshold.md): the line fitted over its blocks, then read.
 * `efforts` are the bests of each ride from 3 to 60 min with `ageDays` counted back from the newest activity; `blocks` are
 * the 5 min blocks of power-meter rides with usable heart rate (the analysis leaves out rides whose heart rate it sets
 * aside); `thresholdHr` is the heart rate at threshold, or null. All values share one unit. Null where no ride has an effort of
 * 3 min or more, or none has any weight. A caller with many windows of one set fits the line once instead (`fitRideLine`).
 */
export function rideThreshold(
  efforts: readonly ThresholdEffort[],
  blocks: readonly ThresholdBlock[],
  thresholdHr: number | null,
): ThresholdEstimate | null {
  const { rides, ages } = prepareFlat(efforts, blocks)
  return estimateOver(thresholdBasis(rides, fitRideLine(rides, ages), thresholdHr), ages)
}
