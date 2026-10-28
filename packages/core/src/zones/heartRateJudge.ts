import { sameMasses } from '../athlete/mass'
import type { AnalysisResult } from '../digest/combine'
import { heartRateSetAsideOf } from '../digest/setAside'
import { sameDigests } from '../periodCache'
import type { ActivityDigest, AthleteSettings, BikeModel } from '../types'

/** The list for a library with no heart rate to judge, one object so a cache keyed on it holds. */
const NONE: readonly string[] = []

/**
 * Whose heart rate is set aside, judged over every visible activity so that the period on screen and the
 * one before it are read by the same rule, whichever period is picked. For all time it is the period's own
 * analysis. Otherwise it is the judgement of `combine` without the rest of the analysis
 * (`heartRateSetAsideOf`), priced with the period's bike model, so it adds no analysis to the session.
 * The last one is kept while the digests, the masses and the bike model are the same.
 */
export class HeartRateJudge {
  private entry: {
    digests: ActivityDigest[]
    settings: AthleteSettings
    bikeModel: BikeModel
    setAside: string[]
  } | null = null

  of(
    visible: ActivityDigest[],
    settings: AthleteSettings,
    selected: ActivityDigest[],
    period: AnalysisResult,
  ): readonly string[] {
    if (sameDigests(selected, visible)) return period.heartRateSetAside
    if (!visible.some((digest) => digest.distributions?.heartRate !== undefined)) return NONE
    const hit = this.entry
    if (
      hit !== null &&
      hit.bikeModel === period.bikeModel &&
      sameMasses(hit.settings, settings) &&
      sameDigests(hit.digests, visible)
    ) {
      return hit.setAside
    }
    const setAside = heartRateSetAsideOf(visible, settings, period.bikeModel)
    this.entry = { digests: visible, settings, bikeModel: period.bikeModel, setAside }
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
