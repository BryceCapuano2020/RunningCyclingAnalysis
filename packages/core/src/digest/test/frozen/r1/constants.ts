/**
 * The values the R1 reader takes from the rest of the code, copied so a later change to the
 * live constants cannot move what this reader accepts. Frozen with the reader.
 */

export const DIGEST_VERSION = 1

export const DURATIONS_S = [
  5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600, 5400, 7200,
  10800,
] as const

/** 1 km, 1 mile, 5 km, 10 km, a half marathon and the marathon, m (main's list when W1 was taken). */
export const RUN_RECORD_DISTANCES_M = [1000, 1609.344, 5000, 10_000, 21_097.5, 42_195] as const

export const DISTANCE_BEST_TOLERANCE = 0.01
export const MAX_KM_SPLITS = 500
export const MAX_MILE_SPLITS = 320

export const DISTRIBUTION_BINS = {
  heartRate: { width: 1, maxBin: 255 },
  power: { width: 5, maxBin: 400 },
  speed: { width: 0.05, maxBin: 250 },
} as const
export type DistributionMeasure = keyof typeof DISTRIBUTION_BINS

export const DURABILITY_AFTER_S = [3600, 5400, 7200] as const
export const DURABILITY_DURATIONS_S = [300, 1200] as const

/** The measures kept for each sport. */
export const MEASURES_OF_SPORT: Record<'run' | 'ride', readonly DistributionMeasure[]> = {
  run: ['heartRate', 'speed'],
  ride: ['heartRate', 'power'],
}
