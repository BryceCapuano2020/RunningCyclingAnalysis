/**
 * Evidence a digest keeps for the zones, durability and drift views. Every field is optional on a
 * digest, so a digest from before it parses, and none of it depends on the athlete's settings.
 */

/**
 * Seconds spent in each bin of one measure, over the moving, valid samples. Sparse: counts[i] is the
 * seconds in bin offset + i, so a bin spans [bin * width, (bin + 1) * width) in the measure's unit,
 * with the width in DISTRIBUTION_BINS. The first and last counts are not zero.
 */
export interface DigestDistribution {
  offset: number
  counts: number[]
}

/**
 * Heart rate for any activity with a heart-rate stream, measured power for rides with a power meter
 * (never an estimate), and running speed for runs. A measure that does not apply is absent.
 */
export interface DigestDistributions {
  heartRate?: DigestDistribution
  power?: DigestDistribution
  speed?: DigestDistribution
}

/**
 * The best output of one duration in windows that start after at least afterS seconds of moving
 * time, in the unit of the main curve: gross metabolic W/kg for runs, measured W for rides.
 */
export interface DigestDurabilityPoint {
  afterS: number
  durationS: number
  value: number
}

/**
 * Output per heart rate in the first and second half of the moving time after the warm-up, of an
 * effort that stayed steady. Output is metabolic W/kg for runs and measured W for rides, so a ratio
 * is W/kg or W per bpm. durationS is the moving seconds the two halves cover together.
 */
export interface DigestDrift {
  firstRatio: number
  secondRatio: number
  durationS: number
}
