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

export function seasonDigests(clock: SampleClock): ActivityDigest[] {
  const draw = () => samplePlan(clock).map((entry) => digestActivity(generateSampleActivity(entry)))
  if (clock.utcOffsetMinutes !== undefined) return draw()
  const day = Math.floor(clock.nowMs / 86_400_000)
  const held = SEASONS.get(day) ?? draw()
  SEASONS.set(day, held)
  return held
}
