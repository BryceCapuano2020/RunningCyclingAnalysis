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

/**
 * The last time in zones, reused while its inputs hold: the activities of the period and the one before,
 * the settings the zones read, the analysis that supplies estimated references (itself kept while the
 * digests and masses are the same, so the object is the key) and the list of heart rates set aside, which
 * the caller judges over the whole library (HeartRateJudge) so every period is read by the same rule. A list
 * that is the same object is the same list. A session asks on every state, so a change that moves none of
 * these costs nothing.
 */
export class ZoneTimeCache {
  private entry: Entry | null = null

  get(
    selected: ActivityDigest[],
    previous: ActivityDigest[],
    settings: AthleteSettings,
    analysis: AnalysisResult | null,
    heartRateSetAside: readonly string[],
  ): PeriodZoneTimes {
    const key = settingsKey(settings)
    const hit = this.entry
    if (
      hit !== null &&
      hit.settings === key &&
      hit.analysis === analysis &&
      hit.heartRateSetAside === heartRateSetAside &&
      sameDigests(hit.selected, selected) &&
      sameDigests(hit.previous, previous)
    ) {
      return hit.times
    }
    const setAside = new Set(heartRateSetAside)
    const times: PeriodZoneTimes = {
      current: periodTimeInZones(selected, settings, analysis, setAside),
      previous:
        previous.length === 0 ? null : periodTimeInZones(previous, settings, analysis, setAside),
    }
    this.entry = { selected, previous, settings: key, analysis, heartRateSetAside, times }
    return times
  }
}
