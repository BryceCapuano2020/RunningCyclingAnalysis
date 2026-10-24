import type { Resampled } from '../fit/resample'
import type { Sport } from '../types'

/** Below this speed, in m/s, a sample counts as stopped. */
const STOPPED_SPEED_MS = 0.5
/** Share of recorded (not paused) samples that must be stopped for a powered ride to be indoor. */
const STOPPED_SHARE = 0.95
/** A powered ride without positions is indoor only if its altitude spans less than this, in metres. */
const TRAINER_ALTITUDE_RANGE_M = 10

/**
 * Whether a unit with no positions is indoor. No altitude means indoor. A cycling unit with power is
 * also indoor when it is stopped for nearly all of its recorded time and its altitude hardly
 * changes: a trainer's barometer reads a few metres of noise, and a missing speed sensor reads as
 * stopped. Paused time is not counted.
 */
export function isIndoorWithoutPositions(s: Resampled, sport: Sport): boolean {
  if (!s.hasAltitude) return true
  return (
    sport === 'ride' &&
    s.hasPower &&
    altitudeRange(s) < TRAINER_ALTITUDE_RANGE_M &&
    isStoppedMostly(s)
  )
}

function altitudeRange(s: Resampled): number {
  let low = Infinity
  let high = -Infinity
  for (const h of s.altitude) {
    if (Number.isFinite(h)) {
      low = Math.min(low, h)
      high = Math.max(high, h)
    }
  }
  return high - low
}

function isStoppedMostly(s: Resampled): boolean {
  let recorded = 0
  let stopped = 0
  for (let i = 0; i < s.n; i++) {
    if (s.paused[i] === 1) continue
    recorded++
    // A missing speed (NaN) counts as stopped.
    if (!(s.speed[i]! >= STOPPED_SPEED_MS)) stopped++
  }
  return recorded > 0 && stopped >= STOPPED_SHARE * recorded
}
