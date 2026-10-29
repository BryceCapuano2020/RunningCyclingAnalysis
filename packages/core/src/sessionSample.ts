import { digestActivity } from './digest'
import { generateSampleActivity, samplePlan } from './synthetic'
import type { SampleClock } from './synthetic'
import type { ActivityDigest } from './types'

/**
 * The digests of the sample's season on a clock. A digest is never changed once it is made, so a season on a
 * clock with no time zone of its own (the fixed reference clock and any other UTC clock, which tests use) is
 * drawn once and shared, and a test that loads the sample many times pays for one drawing. The app's clock
 * carries the device's zone, so it is drawn on each load, and nothing is kept for it.
 */
const SEASONS = new Map<number, ActivityDigest[]>()

/** Draws a season on a clock: every planned activity, second by second, then its digest. */
export function drawSeason(clock: SampleClock): ActivityDigest[] {
  return samplePlan(clock).map((entry) => digestActivity(generateSampleActivity(entry)))
}

/**
 * The season's digests on a clock. `draw` is the drawing, a parameter so a test can see when it runs without
 * drawing a season.
 */
export function seasonDigests(
  clock: SampleClock,
  draw: (clock: SampleClock) => ActivityDigest[] = drawSeason,
): ActivityDigest[] {
  if (clock.utcOffsetMinutes !== undefined) return draw(clock)
  const day = Math.floor(clock.nowMs / 86_400_000)
  const held = SEASONS.get(day) ?? draw(clock)
  SEASONS.set(day, held)
  return held
}
