import { sameDigests } from '../periodCache'
import type { ActivityDigest, AthleteSettings } from '../types'
import type { ZoneEstimates } from './zones'
import { noTimeInZones, periodTimeInZones } from './periodTime'
import type { TimeInZones } from './periodTime'
import { widenedTimeInZones } from './widenedTime'
import type { WidenedZoneTimes, ZoneReach } from './widenedTime'

/** The time in zones of the period on screen and of the one before it, cut by the same zones. */
export interface PeriodZoneTimes {
  current: TimeInZones
  /** Null for all time, or when the period before holds no activities. */
  previous: TimeInZones | null
  /**
   * The sports whose period holds too little to describe, over the wider window that does (12 months, else all time).
   * Absent when the period describes every sport it has, or is all time.
   */
  widened?: WidenedZoneTimes
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
export function settingsKey(settings: AthleteSettings): string {
  return JSON.stringify([settings.massKg, settings.measurements ?? []])
}

interface Entry {
  selected: ActivityDigest[]
  previous: ActivityDigest[]
  settings: string
  analysis: ZoneEstimates | null
  heartRateSetAside: readonly string[]
  reach: ZoneReach | undefined
  times: PeriodZoneTimes
}

/** Whether two reaches are of the same library and the same period. */
function sameReach(a: ZoneReach | undefined, b: ZoneReach | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return (
    a.period.endMs === b.period.endMs &&
    a.period.days === b.period.days &&
    sameDigests(a.library, b.library)
  )
}

/** How many results are kept: the few periods the control offers, so that switching between them is free. */
const ZONE_TIMES_KEPT = 4

/**
 * The last few times in zones, reused while their inputs hold: the activities of the period and the one before,
 * the settings the zones read, the library and period a thin sport widens over, the analysis that supplies estimated references (itself kept while the
 * digests and masses are the same, so the object is the key) and the list of heart rates set aside, which
 * the caller judges over the whole library (HeartRateJudge) so every period is read by the same rule. A list
 * that is the same object is the same list. A session asks on every state, so a change that moves none of
 * these costs nothing, and going back to a period already shown costs nothing either. Newest use first.
 */
export class ZoneTimeCache {
  private entries: Entry[] = []

  /** Lets go of every kept result, with the digests they hold, when the library is cleared or the athlete signs out. */
  clear(): void {
    this.entries = []
  }

  get(
    selected: ActivityDigest[],
    previous: ActivityDigest[],
    settings: AthleteSettings,
    analysis: ZoneEstimates | null,
    heartRateSetAside: readonly string[],
    reach?: ZoneReach,
  ): PeriodZoneTimes {
    const key = settingsKey(settings)
    const hit = this.entries.findIndex(
      (entry) =>
        entry.settings === key &&
        entry.analysis === analysis &&
        entry.heartRateSetAside === heartRateSetAside &&
        sameDigests(entry.selected, selected) &&
        sameDigests(entry.previous, previous) &&
        sameReach(entry.reach, reach),
    )
    if (hit >= 0) {
      const [entry] = this.entries.splice(hit, 1)
      this.entries.unshift(entry!)
      return entry!.times
    }
    const setAside = new Set(heartRateSetAside)
    const current = periodTimeInZones(selected, settings, analysis, setAside)
    const widened =
      reach === undefined ? {} : widenedTimeInZones(current, reach, settings, analysis, setAside)
    const times: PeriodZoneTimes = {
      current,
      previous:
        previous.length === 0 ? null : periodTimeInZones(previous, settings, analysis, setAside),
      ...(Object.keys(widened).length === 0 ? {} : { widened }),
    }
    this.entries.unshift({
      selected,
      previous,
      settings: key,
      analysis,
      heartRateSetAside,
      reach,
      times,
    })
    this.entries.length = Math.min(this.entries.length, ZONE_TIMES_KEPT)
    return times
  }
}
