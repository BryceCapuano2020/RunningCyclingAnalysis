import { sessionEffort } from '../effort'
import type { EffortVerdict, MaxHeartRates, ReferenceReading } from '../effort'
import type { ActivityDigest, Sport } from '../types'
import { periodDurability } from './durabilityPeriod'
import { driftTrend } from './driftTrend'
import type { EffortRuler, LateEvidenceBySport } from './lateEvidenceTypes'

/** The library's reference heart rates and what each can certify: the ruler a session's effort is read against. */
export interface LateReference {
  referenceHr: MaxHeartRates
  referenceReading: Record<Sport, ReferenceReading | null>
}

/**
 * The late-effort evidence of each sport among the digests. An activity whose heart rate is set aside
 * has no drift, since its heart rate cannot be right; its output still counts for durability.
 *
 * With the library's reference, a late best counts only sessions that did not show, by heart rate, that they never
 * asked for much: a session whose peak heart rate was under the hard line, or whose reference cannot certify a
 * maximum, says what an easy long run does late (nothing about durability). A session without a heart rate, or with
 * it set aside, counts, since nothing says it was easy. The ruler says how hard the sessions behind the late bests were.
 */
export function lateEvidence(
  digests: ActivityDigest[],
  heartRateSetAside: ReadonlySet<string>,
  judged?: LateReference,
): LateEvidenceBySport {
  const trusted = digests.filter((digest) => !heartRateSetAside.has(digest.id))
  const evidence = (sport: Sport) => {
    const referenceBpm = judged?.referenceHr[sport] ?? null
    const reading = judged?.referenceReading[sport] ?? null
    const verdictOf = (digest: ActivityDigest): EffortVerdict =>
      heartRateSetAside.has(digest.id)
        ? 'unknown'
        : sessionEffort(digest.maxHeartRate, referenceBpm, reading)
    const qualifies = (digest: ActivityDigest) =>
      judged === undefined || verdictOf(digest) !== 'notHard'
    const durability = periodDurability(digests, sport, qualifies)
    return {
      durability,
      drift: driftTrend(trusted, sport, referenceBpm),
      ruler: judged === undefined ? null : rulerOf(digests, sport, referenceBpm, verdictOf),
    }
  }
  return { run: evidence('run'), ride: evidence('ride') }
}

/** The peak heart rate of the sport's sessions with late bests that a heart rate judged hard, over the reference. */
function rulerOf(
  digests: ActivityDigest[],
  sport: Sport,
  referenceBpm: number | null,
  verdictOf: (digest: ActivityDigest) => EffortVerdict,
): EffortRuler | null {
  if (referenceBpm === null) return null
  const shares = digests
    .filter((d) => d.sport === sport && (d.durability?.length ?? 0) > 0)
    .filter((d) => verdictOf(d) === 'hard')
    .map((d) => d.maxHeartRate! / referenceBpm)
  if (shares.length === 0) return null
  return { sessions: shares.length, lowShare: Math.min(...shares), highShare: Math.max(...shares) }
}
