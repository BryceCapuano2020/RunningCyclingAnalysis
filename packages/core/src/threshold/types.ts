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

/** One 5 min block of a power-meter ride with usable heart rate. */
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
  /** The answer: the median of what the power and the heart rate allow. */
  value: number
  /** Its 10th percentile. */
  low: number
  /** Its 90th percentile. */
  high: number
  /** The power-only estimate, the floor the answer is built on. */
  efforts: {
    value: number
    rides: number
    /** The ride with the highest estimate among those the mean kept, and the effort that gave it. */
    strongest: { activityId: string; durationS: number }
  }
  /** What heart rate said, before fusion, from this many efforts; or why it said nothing. */
  heartRate: { value: number; efforts: number } | { refused: HeartRateRefusal }
}
