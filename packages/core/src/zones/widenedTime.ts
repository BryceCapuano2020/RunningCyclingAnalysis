import { windowEnding } from '../period'
import type { Period } from '../period'
import type { ActivityDigest, AthleteSettings, Sport } from '../types'
import { SPORTS } from '../types'
import { periodTimeInZones } from './periodTime'
import type { MeasureTime, TimeInZones } from './periodTime'
import { hasEnoughZoneTime } from './zoneShares'
import type { ZoneEstimates } from './zones'

/** The days a sport's time in zones widens to when its period holds too little: 12 months, ending with the period. */
export const WIDENED_YEAR_DAYS = 365

/** How far a sport's time in zones was widened: the 12 months ending with the period, or all time. */
export type ZoneWindow = 'year' | 'all'

/** One sport's time in zones over a window wider than the period, which the period held too little to describe. */
export interface WidenedZoneTime {
  window: ZoneWindow
  rows: MeasureTime[]
}

/** The sports whose time in zones was widened. A sport the period describes is not here. */
export type WidenedZoneTimes = Partial<Record<Sport, WidenedZoneTime>>

/** What a widening reads: the whole library, and the period it widens from. */
export interface ZoneReach {
  library: ActivityDigest[]
  period: Pick<Period, 'endMs' | 'days'>
}

/** Whether a sport's rows give a bar worth drawing at all: some activity was counted with time in it. */
function holdsTime(rows: readonly MeasureTime[]): boolean {
  return rows.some((row) => row.counted > 0 && row.totalSeconds > 0)
}

/**
 * The time in zones of each sport whose period holds too little to describe (fewer than 3 activities or an hour in
 * every measure), over the 12 months ending with the period and, when that is too little too, over all time. All time
 * is the last word: it is shown for whatever it holds. A sport the period describes, or one the library holds nothing
 * of, is left out, as is every sport for all time (which is the widest there is).
 */
export function widenedTimeInZones(
  current: TimeInZones,
  reach: ZoneReach,
  settings: AthleteSettings,
  estimates: ZoneEstimates | null,
  heartRateSetAside: ReadonlySet<string>,
): WidenedZoneTimes {
  const { library, period } = reach
  const widened: WidenedZoneTimes = {}
  if (period.days === null || period.endMs === null) return widened
  const { startMs, endMs } = windowEnding(period.endMs, WIDENED_YEAR_DAYS)
  for (const sport of SPORTS) {
    if (current[sport].some(hasEnoughZoneTime)) continue
    const own = library.filter((digest) => digest.sport === sport)
    const timeOf = (digests: readonly ActivityDigest[]) =>
      periodTimeInZones(digests, settings, estimates, heartRateSetAside)[sport]
    const year = timeOf(
      own.filter((digest) => digest.startMs >= startMs && digest.startMs <= endMs),
    )
    if (year.some(hasEnoughZoneTime)) {
      widened[sport] = { window: 'year', rows: year }
      continue
    }
    const all = timeOf(own)
    if (holdsTime(all)) widened[sport] = { window: 'all', rows: all }
  }
  return widened
}
