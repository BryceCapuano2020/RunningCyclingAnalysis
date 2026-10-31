import { MAX_INTERPOLATED_GAP_S } from '../fit/resample'
import type { RawRecord, Resampled } from '../fit/resample'

/**
 * The seconds a segment's records vouch for: one for its first sample, then each gap the resampler
 * bridges, and one second for each longer gap, which it treats as a pause. Two records hours apart
 * vouch for two seconds, while sparse records every few seconds vouch for their whole span.
 */
export function vouchedSeconds(segment: RawRecord[]): number {
  let total = 1
  for (let i = 1; i < segment.length; i++) {
    const gapS = (segment[i]!.tMs - segment[i - 1]!.tMs) / 1000
    total += gapS <= MAX_INTERPOLATED_GAP_S ? gapS : 1
  }
  return total
}

/** The seconds of the grid the device was recording: every second that is not paused. */
export function activeSeconds(s: Resampled): number {
  let count = 0
  for (let i = 0; i < s.n; i++) if (s.paused[i] !== 1) count++
  return count
}

/** Whether at least half of a segment's gaps are longer than the resampler bridges. */
export function mostlySparse(segment: RawRecord[]): boolean {
  let long = 0
  for (let i = 1; i < segment.length; i++) {
    if ((segment[i]!.tMs - segment[i - 1]!.tMs) / 1000 > MAX_INTERPOLATED_GAP_S) long++
  }
  return segment.length > 1 && long * 2 >= segment.length - 1
}
