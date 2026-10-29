import { digestActivity } from './digest'
import { generateSampleActivity, samplePlan } from './synthetic'
import type { SampleClock } from './synthetic'
import type { ActivityDigest } from './types'

/**
 * The digests of the sample's season on a clock. A digest is never changed once it is made, so a season is
 * drawn once and shared, whatever the clock's zone: the app's clock carries the device's zone, and a load of
 * the sample, or a switch back to it, would otherwise draw every activity second by second again.
 *
 * What a season holds depends on the Sunday it ends on and on the zone's offset at each start, nothing else,
 * so it is kept under its planned starts. Planning draws no samples, and it takes the zone's changes of
 * offset (daylight saving) into account, which a single offset would not. A new week, or another zone,
 * plans other starts and draws its own season. A few seasons are kept, the oldest dropped first, since a
 * visitor's device has one zone and one week.
 */
const SEASONS = new Map<string, ActivityDigest[]>()
const SEASONS_KEPT = 4

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
  const key = samplePlan(clock)
    .map((entry) => entry.spec.startMs)
    .join(',')
  const held = SEASONS.get(key)
  if (held !== undefined) return held
  const season = draw(clock)
  SEASONS.set(key, season)
  if (SEASONS.size > SEASONS_KEPT) SEASONS.delete(SEASONS.keys().next().value!)
  return season
}
