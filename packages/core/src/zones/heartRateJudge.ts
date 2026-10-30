import { sameMasses } from '../athlete/mass'
import { judgeHeartRate, libraryThresholds } from '../digest/setAside'
import { NO_HEART_RATE_JUDGEMENT } from '../digest/setAsideTypes'
import type { HeartRateJudgement } from '../digest/setAsideTypes'
import { sameDigests } from '../periodCache'
import type { ActivityDigest, AthleteSettings } from '../types'

/**
 * Whose heart rate is set aside: one judgement per library (`judgeHeartRate` over every visible activity),
 * with the references it was judged against, whatever period is picked. Every reader takes it: the period
 * analyses, the heart-rate charts, the zones and the activity page, so an activity is judged once and the
 * same everywhere.
 *
 * The last judgement is kept while the digests and the masses are the same, so changing the period costs
 * nothing. A judgement that is the same object is the same judgement.
 */
export class HeartRateJudge {
  private entry: {
    digests: ActivityDigest[]
    settings: AthleteSettings
    judgement: HeartRateJudgement
  } | null = null

  of(visible: ActivityDigest[], settings: AthleteSettings): HeartRateJudgement {
    const hit = this.entry
    if (hit !== null && sameMasses(hit.settings, settings) && sameDigests(hit.digests, visible)) {
      return hit.judgement
    }
    // Without heart rate nothing is set aside, but the library's thresholds are still the zones' references.
    const judgement = visible.some((digest) => digest.hasHeartRate)
      ? judgeHeartRate(visible, settings)
      : { ...NO_HEART_RATE_JUDGEMENT, ...libraryThresholds(visible, settings) }
    this.entry = { digests: visible, settings, judgement }
    return judgement
  }

  /** Lets go of a judgement that holds a digest the library no longer has. */
  release(library: readonly ActivityDigest[]): void {
    const held = new Set(library)
    if (this.entry !== null && !this.entry.digests.every((digest) => held.has(digest))) {
      this.entry = null
    }
  }
}
