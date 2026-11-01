import type { ActivityDigest } from '../types'

const SECONDS_PER_HOUR = 3600

/** A figure that is not a number (a digest keeps NaN for a distance or climb it could not read) adds nothing. */
export const finite = (value: number): number => (Number.isFinite(value) ? value : 0)

/** The hours an activity adds: moving time when the digest keeps it, else elapsed time, as the activity list counts it. */
export function activityHours(digest: ActivityDigest): number {
  return finite(digest.movingS ?? digest.durationS) / SECONDS_PER_HOUR
}
