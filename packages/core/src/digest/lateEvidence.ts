import { LATE_IN_EFFORT } from '../constants'
import { sessionVerdict } from '../effort'
import type { EffortReference, EffortVerdict } from '../effort'
import type { ActivityDigest, Sport } from '../types'
import { hasSupport, periodDurability } from './durabilityPeriod'
import { driftTrend } from './driftTrend'
import type { EffortRuler, LateEvidence, LateEvidenceBySport } from './lateEvidenceTypes'

/** The library's effort references: the ruler a session's effort is read against. */
export interface LateReference {
  effortReference: EffortReference
}

/**
 * The late-effort evidence of each sport among the digests. An activity whose heart rate is set aside
 * has no drift, since its heart rate cannot be right; its output still counts for durability.
 *
 * Every session counts toward a late best, whatever its heart rate said: a session that never asked for much, or one
 * whose reference cannot certify a maximum, gives a lower figure, and the figure is a floor. With the library's references
 * the ruler says how hard the sessions behind the late bests were, which the page gives as a short label.
 *
 * A half the period holds too little for (see `LATE_IN_EFFORT`) reads the whole `library` instead, and the evidence
 * says which half did.
 */
export function lateEvidence(
  digests: ActivityDigest[],
  heartRateSetAside: ReadonlySet<string>,
  judged?: LateReference,
  library?: ActivityDigest[],
): LateEvidenceBySport {
  const evidence = (sport: Sport): LateEvidence => {
    // The library only widens a sport it holds more of than the period does.
    const count = (pool: ActivityDigest[]) => pool.filter((digest) => digest.sport === sport).length
    const wider = library !== undefined && count(library) > count(digests) ? library : null
    const referenceBpm = judged?.effortReference.referenceHr[sport] ?? null
    const reading = judged?.effortReference.reading[sport] ?? null
    const verdictOf = (digest: ActivityDigest): EffortVerdict =>
      heartRateSetAside.has(digest.id) ? 'unknown' : sessionVerdict(digest, referenceBpm, reading)
    const driftOf = (pool: ActivityDigest[]) =>
      driftTrend(
        pool.filter((digest) => !heartRateSetAside.has(digest.id)),
        sport,
        referenceBpm,
      )
    const durability = periodDurability(digests, sport)
    const drift = driftOf(digests)
    const pooledDurability = wider !== null && !hasSupport(durability)
    const pooledDrift = wider !== null && drift.length < LATE_IN_EFFORT.minActivities
    const durabilityPool = pooledDurability ? wider : digests
    return {
      durability: pooledDurability ? periodDurability(wider, sport) : durability,
      drift: pooledDrift ? driftOf(wider) : drift,
      ruler: judged === undefined ? null : rulerOf(durabilityPool, sport, referenceBpm, verdictOf),
      ...(pooledDurability ? { durabilityPooled: true as const } : {}),
      ...(pooledDrift ? { driftPooled: true as const } : {}),
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
