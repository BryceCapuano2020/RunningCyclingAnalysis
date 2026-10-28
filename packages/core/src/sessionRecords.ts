import { sameMasses } from './athlete/mass'
import { sameDigests } from './period'
import { recordHolders } from './records'
import type { EarnedRecord } from './records'
import type { ActivityDigest, AthleteSettings } from './types'

/**
 * The best efforts each activity holds across the visible library, not the period. The last are
 * reused while the digests and both masses are the same.
 */
export class RecordsCache {
  // The last record holders, with the digests and masses they were computed from.
  private last: {
    digests: ActivityDigest[]
    settings: AthleteSettings
    records: Map<string, EarnedRecord[]>
  } | null = null

  holders(visible: ActivityDigest[], settings: AthleteSettings): Map<string, EarnedRecord[]> {
    const cached = this.last
    if (
      cached !== null &&
      sameMasses(cached.settings, settings) &&
      sameDigests(cached.digests, visible)
    ) {
      return cached.records
    }
    const records = recordHolders(visible, settings)
    this.last = { digests: visible, settings, records }
    return records
  }
}
