import { civilOfDay, localDayOf } from '../calendar'
import { sameSet } from '../digestMemo'
import { SPORTS } from '../types'
import type { ActivityDigest, Sport } from '../types'
import { effortSplit, periodTimeInZones, settingsKey } from '../zones'
import type { MeasureTime } from '../zones'
import { perSport } from './sports'
import type { HistoryInput, HistoryPart } from './types'

/** One sport's heart-rate time in one calendar year, as the share of it in each band. */
export interface IntensityShares {
  /** Shares of the heart-rate time, 0 to 1: zones 1 and 2, zone 3, and zones 4 and 5. All zero without time. */
  easy: number
  moderate: number
  hard: number
  /** The heart-rate time the shares are of, in seconds. */
  seconds: number
  /** Activities whose heart rate counted: each had a reading and zones, and was not set aside. */
  counted: number
  /** Activities whose heart rate had no zones to be cut by, for want of a maximum. */
  noZones: number
  /** Every activity of the sport in the year, whether or not its heart rate counted. */
  activities: number
}

/** A calendar year, with each sport's intensity in it. A year with no activity, between two that have some, is zeros. */
export interface IntensityRow {
  year: number
  sports: Record<Sport, IntensityShares>
}

/**
 * A sport's heart-rate time split into the easy, middle and hard bands of the time in zones (`effortSplit`), so
 * this chart and the Time in zones section name the same zones as easy and as hard.
 */
function sharesOf(times: readonly MeasureTime[], activities: number): IntensityShares {
  const time = times.find((row) => row.measure === 'heartRate')
  if (time === undefined) {
    return { easy: 0, moderate: 0, hard: 0, seconds: 0, counted: 0, noZones: 0, activities }
  }
  const split = effortSplit(time)
  return {
    easy: split.easy,
    moderate: split.middle,
    hard: split.hard,
    seconds: time.totalSeconds,
    counted: time.counted,
    noZones: time.noZones,
    activities,
  }
}

/**
 * Every calendar year from the library's first to its last. Every activity is cut by the zones in effect on the day
 * the page is read (`nowMs`), through the same re-cut as the time in zones (`periodTimeInZones`), so no year moves when
 * a setting entered for another date changes. Set-aside heart rate is left out there, as it is everywhere else.
 */
function build(digests: ActivityDigest[], input: HistoryInput): IntensityRow[] {
  const byYear = new Map<number, ActivityDigest[]>()
  for (const digest of digests) {
    if (!SPORTS.includes(digest.sport)) continue
    const year = civilOfDay(localDayOf(digest)).year
    const list = byYear.get(year)
    if (list === undefined) byYear.set(year, [digest])
    else list.push(digest)
  }
  if (byYear.size === 0) return []
  const years = [...byYear.keys()]
  const first = Math.min(...years)
  return Array.from({ length: Math.max(...years) - first + 1 }, (_, i) => {
    const year = first + i
    const inYear = byYear.get(year) ?? []
    const times = periodTimeInZones(
      inYear,
      input.settings,
      input.estimates ?? null,
      input.heartRateSetAside,
      input.nowMs,
    )
    return {
      year,
      sports: perSport((sport) =>
        sharesOf(times[sport], inYear.filter((digest) => digest.sport === sport).length),
      ),
    }
  })
}

const NONE: ReadonlySet<string> = new Set()

/** The same answer for the same day, zone references, settings and set-aside heart rate, whatever the period. */
const same = (a: HistoryInput, b: HistoryInput): boolean =>
  a.nowMs === b.nowMs &&
  (a.estimates ?? null) === (b.estimates ?? null) &&
  settingsKey(a.settings) === settingsKey(b.settings) &&
  sameSet(a.heartRateSetAside ?? NONE, b.heartRateSetAside ?? NONE)

export const intensity: HistoryPart<IntensityRow[]> = { empty: [], build, same }
