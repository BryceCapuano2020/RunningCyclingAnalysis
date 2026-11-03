/*
 * The ride threshold from many efforts (docs/design/threshold.md). Values are in whatever unit the caller passes, the ride
 * curve's gross metabolic W/kg in the app; every effort and block of one call must use the same unit.
 */

/** One best of one ride: its highest average value over `durationS`. */
export interface ThresholdEffort {
  activityId: string
  durationS: number
  value: number
  /** Average heart rate over the effort, or null where there is none or the analysis sets it aside. */
  heartRate: number | null
  /** Days back from the newest activity in the set, so the newest has 0. The estimate reads no clock. */
  ageDays: number
  /** The value comes from estimated watts (no power meter). */
  estimated: boolean
}

/** One best of one ride before its age is known: a window gives the age, the ride's, when it reads the ride. */
export type RideEffort = Omit<ThresholdEffort, 'ageDays'>

/**
 * One 5 min block of a power-meter ride with usable heart rate. It counts toward the heart-rate line when its value is between
 * 45% and 105% of the power estimate. The slope is read within rides, so a ride needs three such blocks to add to it or to the
 * 20 blocks the line needs. A ride with one or two still gives an offset to check against the others, so its efforts are used
 * and its blocks count toward the spread; a ride with four or more whose heart rate does not move is left out as stuck.
 */
export interface ThresholdBlock {
  activityId: string
  heartRate: number
  value: number
}

/** Why the heart-rate estimate is missing: the first guard that stopped it. */
export type HeartRateRefusal =
  | 'no-heart-rate' // no threshold heart rate, or no blocks at all
  | 'few-blocks' // under 20 blocks between half and full threshold power
  | 'stuck' // enough blocks, but the rides' heart rates do not move with power
  | 'flat' // heart rate climbs under 20 bpm from half to full threshold power
  | 'steep' // it climbs over 70 bpm
  | 'no-efforts' // the line is sound, but no steady 8 to 30 min effort sat near the rider's own line

export interface ThresholdEstimate {
  /** The answer: the higher of the median from power alone and the median with heart rate. */
  value: number
  /** The higher of the 10th percentiles of the two. */
  low: number
  /** The higher of the 90th percentiles of the two. */
  high: number
  /** The power-only estimate, the floor the answer is built on. */
  efforts: {
    value: number
    /**
     * The power estimate's relative error: how far the mean of the rides' estimates may sit from the truth, as a share of `value`,
     * never under 2.5%. It is the uncertainty between windows of the same rider, where `low` and `high` are the allowance for the
     * floor (the athlete may be above their best), so a caller asking whether one window differs from another reads this.
     */
    relativeError: number
    rides: number
    /** The ride with the highest estimate among those the mean kept, the effort that gave it, and whether its watts were estimated. */
    strongest: { activityId: string; durationS: number; estimated: boolean }
  }
  /** What heart rate said, before fusion, from this many efforts; or why it said nothing. */
  heartRate: { value: number; efforts: number } | { refused: HeartRateRefusal }
}
