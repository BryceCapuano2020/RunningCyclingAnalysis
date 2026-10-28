import { periodDurability } from './durabilityPeriod'
import { driftTrend } from './driftTrend'
import type { LateEvidenceBySport } from './lateEvidenceTypes'
import type { ActivityDigest } from '../types'

/**
 * The late-effort evidence of each sport among the digests. An activity whose heart rate is set aside
 * has no drift, since its heart rate cannot be right; its output still counts for durability.
 */
export function lateEvidence(
  digests: ActivityDigest[],
  heartRateSetAside: ReadonlySet<string>,
): LateEvidenceBySport {
  const trusted = digests.filter((digest) => !heartRateSetAside.has(digest.id))
  return {
    run: { durability: periodDurability(digests, 'run'), drift: driftTrend(trusted, 'run') },
    ride: { durability: periodDurability(digests, 'ride'), drift: driftTrend(trusted, 'ride') },
  }
}
