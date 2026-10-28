/** One run split: a whole kilometre or mile, or the partial remainder after the last one. */
export interface DigestSplit {
  /** The unit's length, or the length of the partial remainder, m. */
  distanceM: number
  /**
   * Elapsed seconds over the split, including any time stopped in it, rounded to 0.01 s. Null when a
   * boundary of the split falls inside a gap the device did not record, or when it implies a speed no
   * run reaches.
   */
  seconds: number | null
  /** Seconds on flat ground at the same metabolic cost, or null when the time or grade is unknown. */
  gradeAdjustedSeconds: number | null
  /** Climb the split owns, rounded to 0.1 m. Null only when the activity has no altitude. */
  elevationGainM: number | null
  /** Time-weighted mean heart rate over the valid samples, rounded to 0.1 bpm, or null. */
  avgHeartRate: number | null
}

export interface DigestSplits {
  km: DigestSplit[]
  mile: DigestSplit[]
}
