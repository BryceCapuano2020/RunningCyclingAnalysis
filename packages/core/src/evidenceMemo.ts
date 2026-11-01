import { calendarWatch } from './calendar'
import { lateEvidence } from './digest/lateEvidence'
import type { LateReference } from './digest/lateEvidence'
import type { LateEvidenceBySport } from './digest/lateEvidenceTypes'
import { sameHeartRate } from './digest/sameHeartRate'
import type { SameHeartRateBySport } from './digest/sameHeartRateTypes'
import { sameDigests } from './sameDigests'
import type { ActivityDigest } from './types'

/** How many results of each kind are kept: the few periods the control offers, so that switching between them is free. */
const KEPT = 4

/**
 * The readings that take no mass, each reused while the digests it reads and the set-aside are the same: output at the
 * same heart rate, and late-effort evidence. Newest use first, a few kept, so going back to a period already shown is free.
 */
export class EvidenceMemo {
  private moved = calendarWatch()
  // Output at the same heart rate reads no mass, so its key is the digests, the period's start and the set-aside.
  private sameEntries: {
    selected: ActivityDigest[]
    library: ActivityDigest[]
    fromMs: number | null
    setAside: string
    result: SameHeartRateBySport
  }[] = []
  // Late-effort evidence reads no mass either: its key is the period's digests, the library's and the set-aside.
  private lateEntries: {
    selected: ActivityDigest[]
    library: ActivityDigest[]
    setAside: string
    result: LateEvidenceBySport
  }[] = []

  /**
   * Each sport's output at the same heart rate over the selected period, reused while the digests, the
   * library (which sets the reference heart rate), the period's start and the activities set aside are the same.
   * Masses do not enter, so a change of weight does not redo it.
   */
  sameHeartRate(
    selected: ActivityDigest[],
    library: ActivityDigest[],
    fromMs: number | null,
    setAside: readonly string[],
  ): SameHeartRateBySport {
    if (this.moved()) this.sameEntries = []
    const key = setAside.join(',')
    const hit = this.sameEntries.findIndex(
      (entry) =>
        entry.fromMs === fromMs &&
        entry.setAside === key &&
        sameDigests(entry.selected, selected) &&
        sameDigests(entry.library, library),
    )
    if (hit >= 0) {
      const [entry] = this.sameEntries.splice(hit, 1)
      this.sameEntries.unshift(entry!)
      return entry!.result
    }
    const result = sameHeartRate(selected, new Set(setAside), {
      fromMs: fromMs ?? undefined,
      library,
    })
    this.sameEntries.unshift({ selected, library, fromMs, setAside: key, result })
    this.sameEntries.length = Math.min(this.sameEntries.length, KEPT)
    return result
  }

  /**
   * Each sport's late-effort evidence over the selected period, reused while the digests, the library a thin
   * period is pooled with, the set-aside and the reference it judges sessions by are the same.
   */
  late(
    selected: ActivityDigest[],
    library: ActivityDigest[],
    setAside: readonly string[],
    judged?: LateReference,
  ): LateEvidenceBySport {
    const key = `${setAside.join(',')}|${JSON.stringify(judged ?? null)}`
    const hit = this.lateEntries.findIndex(
      (entry) =>
        entry.setAside === key &&
        sameDigests(entry.selected, selected) &&
        sameDigests(entry.library, library),
    )
    if (hit >= 0) {
      const [entry] = this.lateEntries.splice(hit, 1)
      this.lateEntries.unshift(entry!)
      return entry!.result
    }
    const result = lateEvidence(selected, new Set(setAside), judged, library)
    this.lateEntries.unshift({ selected, library, setAside: key, result })
    this.lateEntries.length = Math.min(this.lateEntries.length, KEPT)
    return result
  }

  /** Releases the results that read a digest the library no longer holds. */
  releaseAbsent(held: ReadonlySet<ActivityDigest>): void {
    // The library holds the selection, so one test covers both.
    this.sameEntries = this.sameEntries.filter((entry) =>
      entry.library.every((digest) => held.has(digest)),
    )
    this.lateEntries = this.lateEntries.filter((entry) =>
      entry.library.every((digest) => held.has(digest)),
    )
  }
}
