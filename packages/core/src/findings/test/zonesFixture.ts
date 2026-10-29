import { DAY_MS } from '../../constants'
import type { ActivityDigest } from '../../types'
import type { ZoneActivity, ZoneTables } from '../types'
import { zoneTablesOf } from '../zoneTables'

/** The heart rate zones were set from, bpm; the zone-change nuisance resets it to the lower one mid-library. */
export const ZONE_REFERENCE_BPM = { before: 175, after: 165 } as const
const EASY_THROUGH = 0.83
const HARD_FROM = 0.92

/**
 * Time in the three zone groups from each digest's heart-rate distribution, easy through 83% of the
 * reference and hard from 92%, so a detector that reads ZoneTables can be tried before zones are real.
 * `resetAfterWeeks`, when not null, moves the reference to the lower one that many weeks after the first
 * activity, which moves the zones and nothing else.
 */
export function zonesFromDigests(
  digests: readonly ActivityDigest[],
  resetAfterWeeks: number | null,
): ZoneTables {
  const first = digests[0]?.startMs ?? 0
  const activities: ZoneActivity[] = []
  for (const digest of digests) {
    const histogram = digest.distributions?.heartRate
    if (histogram === undefined) continue
    const reset = resetAfterWeeks !== null && digest.startMs >= first + resetAfterWeeks * 7 * DAY_MS
    const reference = reset ? ZONE_REFERENCE_BPM.after : ZONE_REFERENCE_BPM.before
    let easyS = 0
    let middleS = 0
    let hardS = 0
    for (const [i, seconds] of histogram.counts.entries()) {
      const heartRate = histogram.offset + i + 0.5
      if (heartRate <= EASY_THROUGH * reference) easyS += seconds
      else if (heartRate < HARD_FROM * reference) middleS += seconds
      else hardS += seconds
    }
    activities.push({
      id: digest.id,
      sport: digest.sport,
      startMs: digest.startMs,
      movingS: digest.movingS ?? digest.durationS,
      easyS,
      middleS,
      hardS,
      zoneReferenceBpm: reference,
    })
  }
  return zoneTablesOf(activities)
}
