import { rideGateKey } from './digest/estimatedRide'
import type { EstimatedRideGate } from './digest/estimatedRide'
import { sameMasses } from './athlete/mass'
import { sameDigests } from './period'
import { recordHolders } from './records'
import type { EarnedRecord } from './records'
import type { ActivityDigest, AthleteSettings } from './types'

/**
 * The best efforts each activity holds across the visible library, not the period. The last are
 * reused while the digests, both masses and the library's ride gate are the same.
 */
export class RecordsCache {
  // The last record holders, with the digests and masses they were computed from.
  private last: {
    digests: ActivityDigest[]
    settings: AthleteSettings
    gate: string
    records: Map<string, EarnedRecord[]>
  } | null = null

  holders(
    visible: ActivityDigest[],
    settings: AthleteSettings,
    gate: EstimatedRideGate | null,
  ): Map<string, EarnedRecord[]> {
    const cached = this.last
    const gateId = rideGateKey(gate)
    if (
      cached !== null &&
      cached.gate === gateId &&
      sameMasses(cached.settings, settings) &&
      sameDigests(cached.digests, visible)
    ) {
      return cached.records
    }
    const records = recordHolders(visible, settings, gate)
    this.last = { digests: visible, settings, gate: gateId, records }
    return records
  }
}
