import { DAY_MS } from '../constants'
import { localDayNumber } from '../digest/localDay'
import { STALE_THRESHOLD_DAYS } from '../digest/thresholdTimelineTypes'
import { weekEndFor } from '../calendar'
import type { ActivityDigest, AthleteSettings, Sport } from '../types'
import { ZONE_MEASURES, ZONE_SCHEMES } from './schemes'
import type { ZoneMeasure } from './schemes'
import { activityTimeInZones } from './timeInZones'
import { zonesAt } from './zones'
import type { ZoneEstimates, ZoneSet } from './zones'

const WEEK_MS = 7 * DAY_MS

/** One sport's time in the zones of one measure over a period. */
export interface MeasureTime {
  sport: Sport
  measure: ZoneMeasure
  /** The zone names, lowest effort first. Every activity of a period uses the same scheme, so they match. */
  names: readonly string[]
  /** Seconds in each zone, from every counted activity's own zones. */
  seconds: number[]
  /** The sum of `seconds`. */
  totalSeconds: number
  /** Activities that added to `seconds`. */
  counted: number
  /** Activities without the measure's data: older digests, no heart rate, no power meter. */
  noData: number
  /** Activities whose heart rate the analysis set aside. Heart rate only. */
  setAside: number
  /** Activities with the data but no zones in effect on their date, for want of a reference. */
  noZones: number
  /** Of the counted activities, how many used zones the athlete entered; the rest used the app's estimate. */
  entered: number
  /**
   * The distinct references (watts, bpm or m/s) the athlete entered that the counted activities' zones were cut
   * from, lowest first. A change of an entered setting between two periods puts them in different zones; an
   * estimate follows the athlete's fitness, so two periods are compared in zones relative to it.
   */
  enteredReferences: number[]
  /** Present when counted activities' heart-rate zones were cut from the highest heart rate on file, for want of a maximum. */
  fromHighest?: true
  /**
   * Present when counted activities' pace or power zones were cut from a floor, no fit standing for their dates: the length
   * of the best, s, and the day it was set, ms, of the newest floor used (each activity's is the best of the 12 months up to
   * its week), and how many counted activities were cut from one.
   */
  floor?: { durationS: number; asOfMs: number; activities: number }
}

/** Each sport's measures, in the order ZONE_MEASURES gives. A measure with nothing counted is still there. */
export type TimeInZones = Record<Sport, MeasureTime[]>

function emptyMeasure(sport: Sport, measure: ZoneMeasure): MeasureTime {
  const names = ZONE_SCHEMES[measure].names
  return {
    sport,
    measure,
    names,
    seconds: names.map(() => 0),
    totalSeconds: 0,
    counted: 0,
    noData: 0,
    setAside: 0,
    noZones: 0,
    entered: 0,
    enteredReferences: [],
  }
}

/** The result for no activities, and for a library with no analysis yet. */
export function noTimeInZones(): TimeInZones {
  return {
    run: ZONE_MEASURES.run.map((measure) => emptyMeasure('run', measure)),
    ride: ZONE_MEASURES.ride.map((measure) => emptyMeasure('ride', measure)),
  }
}

/**
 * The instants at which an estimated threshold read from an earlier fit goes stale (`thresholdAt` keeps the newest
 * earlier fit for `STALE_THRESHOLD_DAYS` after its efforts end), ascending. Within a week they are the only moments the zones of an
 * undated athlete can change, besides the week's end.
 */
function staleInstants(estimates: ZoneEstimates | null): number[] {
  if (estimates === null) return []
  const instants: number[] = []
  for (const steps of [estimates.thresholds.run, estimates.thresholds.ride]) {
    // Only a week with no fit of its own reads an earlier one, which is the fit of the step it names.
    for (const step of steps) {
      const older = steps[step.lastFit]
      if (step.fit === null && older?.fit != null && older.asOfMs !== null) {
        instants.push(older.asOfMs + STALE_THRESHOLD_DAYS * DAY_MS)
      }
    }
  }
  return instants.sort((a, b) => a - b)
}

/** Whether any of the ascending instants falls in [from, to]. */
function anyIn(instants: readonly number[], from: number, to: number): boolean {
  let low = 0
  let high = instants.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (instants[middle]! < from) low = middle + 1
    else high = middle
  }
  return low < instants.length && instants[low]! <= to
}

/**
 * The zones in effect on a date are the same all day, and an estimated threshold is the same all week, so activities
 * of one day in one week share one lookup. With no dated setting nothing changes during the week, so a week shares one,
 * unless a threshold goes stale inside it, when each activity has its own lookup.
 */
function zonesByDay(
  settings: AthleteSettings,
  estimates: ZoneEstimates | null,
  at: number | null,
): (digest: ActivityDigest) => ZoneSet[] {
  if (at !== null) {
    // One set of zones for every activity: the ones in effect at that instant, whatever each activity's date.
    const sets = zonesAt(at, settings, estimates)
    return () => sets
  }
  const days = new Map<number | string, ZoneSet[]>()
  const dated = (settings.measurements ?? []).length > 0
  const stale = staleInstants(estimates)
  return (digest: ActivityDigest): ZoneSet[] => {
    const week = weekEndFor(digest)
    const day = dated
      ? `${localDayNumber(digest.startMs)}|${week}`
      : anyIn(stale, week - WEEK_MS + 1, week)
        ? `at|${digest.startMs}`
        : week
    let sets = days.get(day)
    if (sets === undefined) {
      sets = zonesAt(digest, settings, estimates)
      days.set(day, sets)
    }
    return sets
  }
}

/**
 * The time in each zone over a set of activities. Each activity is cut by the zones in effect on its
 * own date (entered settings that changed during the period, or a body weight that changed an
 * estimated ride threshold), so a period can hold activities with different zones. Zones are told
 * apart by level, which every date shares, so the seconds add up per level.
 *
 * `estimates` is the analysis of the whole library and supplies every reference that was not entered. An
 * estimated pace or power is the threshold of the half year before the activity's date, and a heart rate the
 * library's maximum, so an activity has the same zones under every period, and the period before this one is
 * cut by the athlete's fitness then, not by this period's.
 * `heartRateSetAside` names the activities whose heart rate the analysis does not trust.
 * `at`, when given, cuts every activity by the zones in effect at that instant rather than on its own date, so a
 * reading of the whole library does not move when a setting entered for an earlier date changes.
 */
export function periodTimeInZones(
  digests: readonly ActivityDigest[],
  settings: AthleteSettings,
  estimates: ZoneEstimates | null,
  heartRateSetAside: ReadonlySet<string> = new Set(),
  at: number | null = null,
): TimeInZones {
  const out = noTimeInZones()
  const setsOn = zonesByDay(settings, estimates, at)
  const bySportMeasure = new Map<string, MeasureTime>()
  const entered = new Map<MeasureTime, Set<number>>()
  for (const sport of Object.keys(out) as Sport[]) {
    for (const row of out[sport]) {
      bySportMeasure.set(`${sport}.${row.measure}`, row)
      entered.set(row, new Set())
    }
  }
  for (const digest of digests) {
    const sets = setsOn(digest)
    const times = activityTimeInZones(digest, sets, heartRateSetAside.has(digest.id))
    for (const measure of ZONE_MEASURES[digest.sport]) {
      const time = times[measure]
      const row = bySportMeasure.get(`${digest.sport}.${measure}`)
      if (time === undefined || row === undefined) continue
      if (time.kind === 'noData') row.noData++
      else if (time.kind === 'setAside') row.setAside++
      else if (time.kind === 'noZones') row.noZones++
      else {
        row.counted++
        const set = sets.find((each) => each.sport === digest.sport && each.measure === measure)
        if (set?.fromHighest === true) row.fromHighest = true
        if (set?.floorS != null && set.asOfMs !== null) {
          const newest =
            row.floor !== undefined && row.floor.asOfMs >= set.asOfMs ? row.floor : null
          row.floor = {
            durationS: newest?.durationS ?? set.floorS,
            asOfMs: newest?.asOfMs ?? set.asOfMs,
            activities: (row.floor?.activities ?? 0) + 1,
          }
        }
        if (time.source === 'entered') {
          row.entered++
          entered.get(row)!.add(Math.round(time.reference * 1000) / 1000)
        }
        time.seconds.forEach((s, level) => {
          row.seconds[level]! += s
          row.totalSeconds += s
        })
      }
    }
  }
  for (const [row, set] of entered) row.enteredReferences = [...set].sort((a, b) => a - b)
  return out
}
