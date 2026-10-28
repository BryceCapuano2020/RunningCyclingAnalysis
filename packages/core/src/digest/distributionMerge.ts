import { DISTRIBUTION_BINS } from '../constants'
import type { DistributionMeasure } from '../constants'
import type { ActivityDigest, DigestDistribution, Sport } from '../types'
import { MEASURES_OF_SPORT } from './distributions'

/** A period's seconds in each bin of one measure, with how many activities added to it. */
export interface MergedDistribution extends DigestDistribution {
  activities: number
  /** Total seconds, the sum of counts. */
  seconds: number
}

/**
 * Sums the distributions of one measure over the digests of one sport, or null when the sport does
 * not keep the measure or no digest has it. Power is measured watts only, because a digest keeps no
 * power distribution for estimated watts, so the sum never mixes the two.
 */
export function mergeDistributions(
  digests: ActivityDigest[],
  sport: Sport,
  measure: DistributionMeasure,
): MergedDistribution | null {
  if (!MEASURES_OF_SPORT[sport].includes(measure)) return null
  const counts = new Float64Array(DISTRIBUTION_BINS[measure].maxBin + 1)
  let first = counts.length
  let last = -1
  let activities = 0
  for (const digest of digests) {
    const d = digest.sport === sport ? digest.distributions?.[measure] : undefined
    if (d === undefined) continue
    activities++
    d.counts.forEach((seconds, i) => {
      counts[d.offset + i]! += seconds
    })
    first = Math.min(first, d.offset)
    last = Math.max(last, d.offset + d.counts.length - 1)
  }
  if (last < 0) return null
  const merged = Array.from(counts.subarray(first, last + 1))
  return {
    offset: first,
    counts: merged,
    activities,
    seconds: merged.reduce((a, b) => a + b, 0),
  }
}

/** The measure's value at the lower edge of a bin: bpm, W or m/s. */
export function binStart(measure: DistributionMeasure, bin: number): number {
  return bin * DISTRIBUTION_BINS[measure].width
}
