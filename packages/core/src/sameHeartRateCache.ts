import { calendarWatch } from './calendar'
import { sameHeartRate } from './digest/sameHeartRate'
import type { SameHeartRateBySport } from './digest/sameHeartRateTypes'
import { sameDigests } from './sameDigests'
import type { ActivityDigest, Sport } from './types'

/** How many periods are kept: the few the control offers, so that switching between them is free. */
const KEPT = 4

/**
 * Each sport's output at the same heart rate over a period, reused while the digests, the library, the period's start,
 * the activities set aside and the heart rates it is read at (the fitness card's) are the same. Masses do not enter,
 * so a change of weight does not redo it. Newest use first, so going back to a period already shown is free.
 */
export class SameHeartRateCache {
  private moved = calendarWatch()
  private entries: {
    selected: ActivityDigest[]
    library: ActivityDigest[]
    fromMs: number | null
    setAside: string
    reference: string
    result: SameHeartRateBySport
  }[] = []

  of(
    selected: ActivityDigest[],
    library: ActivityDigest[],
    fromMs: number | null,
    setAside: readonly string[],
    referenceHr: Readonly<Record<Sport, number | null>>,
  ): SameHeartRateBySport {
    if (this.moved()) this.entries = []
    const key = setAside.join(',')
    const reference = `${referenceHr.run}|${referenceHr.ride}`
    const hit = this.entries.findIndex(
      (entry) =>
        entry.fromMs === fromMs &&
        entry.setAside === key &&
        entry.reference === reference &&
        sameDigests(entry.selected, selected) &&
        sameDigests(entry.library, library),
    )
    if (hit >= 0) {
      const [entry] = this.entries.splice(hit, 1)
      this.entries.unshift(entry!)
      return entry!.result
    }
    const result = sameHeartRate(selected, new Set(setAside), {
      fromMs: fromMs ?? undefined,
      library,
      referenceHr,
    })
    this.entries.unshift({ selected, library, fromMs, setAside: key, reference, result })
    this.entries.length = Math.min(this.entries.length, KEPT)
    return result
  }

  /** Lets go of the periods whose library holds a digest the library no longer does (the library holds the selection, so one test covers both). */
  release(held: ReadonlySet<ActivityDigest>): void {
    this.entries = this.entries.filter((entry) => entry.library.every((digest) => held.has(digest)))
  }
}
