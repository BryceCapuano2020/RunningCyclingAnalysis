import type { AnalysisResult } from '../digest/combine'
import { sameDigests } from '../periodCache'
import type { ActivityDigest, AthleteSettings } from '../types'
import { noTimeInZones, periodTimeInZones } from './periodTime'
import type { TimeInZones } from './periodTime'

/** The time in zones of the period on screen and of the one before it, cut by the same zones. */
export interface PeriodZoneTimes {
  current: TimeInZones
  /** Null for all time, or when the period before holds no activities. */
  previous: TimeInZones | null
}

/** Nothing analysed yet. */
export const NO_ZONE_TIMES: PeriodZoneTimes = {
  current: noTimeInZones(),
  previous: null,
}

/**
 * What the zones depend on in the settings: the body mass and every dated setting. Two settings with
 * the same key cut every activity the same way. The bike mass does not enter.
 */
function settingsKey(settings: AthleteSettings): string {
  return JSON.stringify([settings.massKg, settings.measurements ?? []])
}

interface Entry {
  selected: ActivityDigest[]
  previous: ActivityDigest[]
  settings: string
  analysis: AnalysisResult | null
  heartRateSetAside: readonly string[]
  times: PeriodZoneTimes
}

/** How many results are kept: the few periods the control offers, so that switching between them is free. */
const ZONE_TIMES_KEPT = 4

/**
 * The last few times in zones, reused while their inputs hold: the activities of the period and the one before,
 * the settings the zones read, the analysis that supplies estimated references (itself kept while the
 * digests and masses are the same, so the object is the key) and the list of heart rates set aside, which
 * the caller judges over the whole library (HeartRateJudge) so every period is read by the same rule. A list
 * that is the same object is the same list. A session asks on every state, so a change that moves none of
 * these costs nothing, and going back to a period already shown costs nothing either. Newest use first.
 */
export class ZoneTimeCache {
  private entries: Entry[] = []

  get(
    selected: ActivityDigest[],
    previous: ActivityDigest[],
    settings: AthleteSettings,
    analysis: AnalysisResult | null,
    heartRateSetAside: readonly string[],
  ): PeriodZoneTimes {
    const key = settingsKey(settings)
    const hit = this.entries.findIndex(
      (entry) =>
        entry.settings === key &&
        entry.analysis === analysis &&
        entry.heartRateSetAside === heartRateSetAside &&
        sameDigests(entry.selected, selected) &&
        sameDigests(entry.previous, previous),
    )
    if (hit >= 0) {
      const [entry] = this.entries.splice(hit, 1)
      this.entries.unshift(entry!)
      return entry!.times
    }
    const setAside = new Set(heartRateSetAside)
    const times: PeriodZoneTimes = {
      current: periodTimeInZones(selected, settings, analysis, setAside),
      previous:
        previous.length === 0 ? null : periodTimeInZones(previous, settings, analysis, setAside),
    }
    this.entries.unshift({ selected, previous, settings: key, analysis, heartRateSetAside, times })
    this.entries.length = Math.min(this.entries.length, ZONE_TIMES_KEPT)
    return times
  }
}
