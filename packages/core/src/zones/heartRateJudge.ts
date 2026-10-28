import { sameMasses } from '../athlete/mass'
import { heartRateSetAsideOf } from '../digest/setAside'
import { sameDigests } from '../periodCache'
import type { ActivityDigest, AthleteSettings } from '../types'

/** The list for a library with no heart rate to judge, one object so a cache keyed on it holds. */
const NONE: readonly string[] = []

/**
 * Whose heart rate is set aside: one judgement per library (`heartRateSetAsideOf` over every visible
 * activity), whatever period is picked. Every reader takes this list, the period analyses, the heart-rate
 * charts, the zones and the activity page, so an activity is judged once and the same everywhere.
 *
 * The last judgement is kept while the digests and the masses are the same, so changing the period costs
 * nothing. A list that is the same object is the same list.
 */
export class HeartRateJudge {
  private entry: {
    digests: ActivityDigest[]
    settings: AthleteSettings
    setAside: string[]
  } | null = null

  of(visible: ActivityDigest[], settings: AthleteSettings): readonly string[] {
    if (!visible.some((digest) => digest.hasHeartRate)) return NONE
    const hit = this.entry
    if (hit !== null && sameMasses(hit.settings, settings) && sameDigests(hit.digests, visible)) {
      return hit.setAside
    }
    const setAside = heartRateSetAsideOf(visible, settings)
    this.entry = { digests: visible, settings, setAside }
    return setAside
  }

  /** Lets go of a judgement that holds a digest the library no longer has. */
  release(library: readonly ActivityDigest[]): void {
    const held = new Set(library)
    if (this.entry !== null && !this.entry.digests.every((digest) => held.has(digest))) {
      this.entry = null
    }
  }
}
