import { DURATIONS_S, RIDE_SUSTAINED_SPEEDS, RUN_WORLD_RECORD_SPEEDS } from '../constants'
import type { CeilingEntry } from '../curves/speedCeiling'
import { interpolatedCeiling } from '../curves/speedCeiling'
import type { Activity, Sport } from '../types'

/** Each sport's table of the fastest speed that can be held over a duration. */
const SUSTAINED_SPEED_TABLE: Record<Sport, readonly CeilingEntry[]> = {
  run: RUN_WORLD_RECORD_SPEEDS,
  ride: RIDE_SUSTAINED_SPEEDS,
}

/** Relative slack on the shortcut's bound, far above the rounding of a prefix sum of a week of samples. */
const SKIP_MARGIN = 1e-6

/** The fastest mean speed, m/s, a person in this sport holds for durationS seconds. */
export function sustainedSpeedCeiling(sport: Sport, durationS: number): number {
  return interpolatedCeiling(SUSTAINED_SPEED_TABLE[sport], durationS)
}

/**
 * The stretches, as [start, end) sample indices, of an activity whose speed is above what anyone
 * sustains. A window of each curve duration is checked at every start: when its mean speed is above
 * the sport's ceiling for that duration, the whole window is returned. The single-sample rules in
 * assessQuality cannot see this: a GPS track that reads 9 m/s for three minutes has no jump in it,
 * and a file whose speed is derived from its positions has no second source to disagree with it.
 * Windows with an unknown speed are not checked. Stretches are merged and in order.
 *
 * A duration whose ceiling the activity's fastest sample cannot reach, over any window, is skipped without a
 * scan: a mean cannot exceed the maximum. That is every long duration of most activities.
 */
export function implausibleSpeedStretches(
  activity: Pick<Activity, 'n' | 'speed' | 'sport'>,
): { start: number; end: number }[] {
  const { n, speed, sport } = activity
  const sum = new Float64Array(n + 1)
  const unknown = new Int32Array(n + 1)
  let fastest = 0
  for (let i = 0; i < n; i++) {
    const v = speed[i]!
    const known = Number.isFinite(v)
    if (known && v > fastest) fastest = v
    sum[i + 1] = sum[i]! + (known ? v : 0)
    unknown[i + 1] = unknown[i]! + (known ? 0 : 1)
  }
  // A difference array: +1 where a flagged window starts and -1 where it ends.
  const covered = new Int32Array(n + 1)
  for (const durationS of DURATIONS_S) {
    if (durationS > n) break
    const limit = sustainedSpeedCeiling(sport, durationS) * durationS
    // The margin absorbs the rounding of the running sums, so a skipped duration is one the scan flags nothing for.
    if (fastest * durationS * (1 + SKIP_MARGIN) <= limit) continue
    for (let start = 0; start + durationS <= n; start++) {
      const end = start + durationS
      if (unknown[end]! - unknown[start]! > 0 || sum[end]! - sum[start]! <= limit) continue
      covered[start] = covered[start]! + 1
      covered[end] = covered[end]! - 1
    }
  }
  const stretches: { start: number; end: number }[] = []
  let depth = 0
  let open = -1
  for (let i = 0; i <= n; i++) {
    depth += covered[i]!
    if (depth > 0 && open < 0) open = i
    if (depth <= 0 && open >= 0) {
      stretches.push({ start: open, end: i })
      open = -1
    }
  }
  return stretches
}
