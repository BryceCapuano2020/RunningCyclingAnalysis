import { DISTRIBUTION_BINS } from '../constants'
import type { ActivityDigest } from '../types'
import { ALL_OUT_FRACTION } from './effort'
import { isHardShare } from './gate'
import type { EffortGate } from './gate'
import type { ReferenceReading } from './reference'

/*
 * Whether a whole activity reached a hard heart rate: what a race prediction, a late best and a durability headline ask of
 * the sessions they draw on. An activity is judged by its peak (the highest 30 s mean) over the sport's reference.
 */

/** Seconds at or over the hard line a session needs, so a lone 30 s spike (a sensor, a sprint) is not a hard session. */
export const HARD_SESSION_SECONDS = 120

/**
 * The average heart rate over the reference from which a long run counts as an endurance effort: at a half marathon
 * or longer a runner's average sits near 80% to 90% of maximum even in a race, so the peak is not the test.
 */
export const ENDURANCE_AVERAGE_SHARE = 0.8

/** The share of the reference from which a heart rate prints as the hard line: 90% is 89.5% and over. */
const HARD_LINE_SHARE = (Math.round(ALL_OUT_FRACTION * 100) - 0.5) / 100

/** Seconds a digest spent at or over `bpm`, or null for a digest from before heart-rate distributions were kept. */
function secondsAtOrOver(digest: ActivityDigest, bpm: number): number | null {
  const distribution = digest.distributions?.heartRate
  if (distribution === undefined) return null
  const { width } = DISTRIBUTION_BINS.heartRate
  let seconds = 0
  distribution.counts.forEach((count, i) => {
    if ((distribution.offset + i) * width >= bpm) seconds += count
  })
  return seconds
}

/** Whether a digest's peak reached the hard line of the reference and, where it has a distribution, stayed there. */
export function reachedHard(digest: ActivityDigest, referenceBpm: number): boolean {
  const { maxHeartRate } = digest
  if (maxHeartRate === null || !isHardShare(maxHeartRate / referenceBpm)) return false
  const near = secondsAtOrOver(digest, referenceBpm * HARD_LINE_SHARE)
  return near === null || near >= HARD_SESSION_SECONDS
}

/**
 * A sport's hard sessions and endurance sessions among its digests. Nothing counts against a reference that cannot be
 * trusted, or when none is known; a digest whose heart rate is set aside counts for neither (the caller treats it as unchecked).
 */
export function sessionsOf(
  digests: readonly ActivityDigest[],
  referenceBpm: number | null,
  reading: ReferenceReading | null,
  setAside: ReadonlySet<string>,
): EffortGate['sessions'] {
  const sessions: EffortGate['sessions'] = { hard: [], endurance: [] }
  if (referenceBpm === null || !(referenceBpm > 0) || reading !== 'trusted') return sessions
  for (const digest of digests) {
    if (setAside.has(digest.id)) continue
    if (reachedHard(digest, referenceBpm)) sessions.hard.push(digest.id)
    const average = digest.avgHeartRate
    if (typeof average === 'number' && average / referenceBpm >= ENDURANCE_AVERAGE_SHARE) {
      sessions.endurance.push(digest.id)
    }
  }
  return sessions
}

/**
 * How a session stands: `hard` when it reached the hard line, `notHard` when its heart rate says it did not or the reference
 * cannot say, `unknown` without a peak or a reference. Late bests and durability take sessions that are not `notHard`.
 */
export function sessionVerdict(
  digest: ActivityDigest,
  referenceBpm: number | null,
  reading: ReferenceReading | null,
): 'hard' | 'notHard' | 'unknown' {
  if (
    digest.maxHeartRate === null ||
    referenceBpm === null ||
    !(referenceBpm > 0) ||
    reading === null
  ) {
    return 'unknown'
  }
  if (reading === 'thin') return 'unknown'
  return reading === 'trusted' && reachedHard(digest, referenceBpm) ? 'hard' : 'notHard'
}
