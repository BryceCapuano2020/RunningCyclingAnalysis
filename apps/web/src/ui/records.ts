import {
  DAY_MS,
  EQUIVALENCE_MIN_S,
  HALF_MARATHON_M,
  HEADLINE_DURATION_S,
  PRIORS,
  RUN_RECORD_DISTANCES_M,
} from '@rca/core/constants'
import type { RunRecordDistanceM } from '@rca/core/constants'
import { startOfLocalDay } from '@rca/core/period'
import type { EarnedRecord } from '@rca/core/records'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import type { SportCurves } from '@rca/core/digest'
import type { ActivitySummary, AnalysisResult, Equivalence } from '@rca/core/pipeline'
import type { CriticalPowerRefusal, Curve, Sport } from '@rca/core/types'
import { EFFORT_LENGTHS_S } from '@rca/core/digest/trendPoints'
import type { EffortLengthS } from '@rca/core/digest/trendPoints'
import type { UnitSystem } from '@rca/core/units'
import {
  formatPace,
  formatPaceValue,
  formatPower,
  formatWatts,
  formatWkg,
  PACE_UNIT,
  METRES_PER_KM,
  METRES_PER_MILE,
  formatDistance,
  formatRecordTime,
  formatDuration,
} from '@rca/core/units'

/**
 * The durations each sport page lists as records. A ride lists 1, 5, 20 and 60 minutes. A run's flat
 * pace over a minute is mostly the slope and altitude reading, so a run starts at 5 minutes.
 */
export const RECORD_DURATIONS_S: Record<Sport, readonly number[]> = {
  run: [300, 1200, 3600],
  ride: [60, 300, 1200, 3600],
}

/** The shortest duration, s, a sport's best-effort curve is drawn from. A run's starts at 3 minutes. */
export const CURVE_START_S: Record<Sport, number> = {
  run: EQUIVALENCE_MIN_S,
  ride: 60,
}

/**
 * The durations that earn a chip, and that a Balance card lists: 5, 20 and 60 minutes. A ride's
 * one-minute best is page-only.
 */
export const CHIP_DURATIONS_S: readonly number[] = RECORD_DURATIONS_S.ride.filter(
  (durationS) => durationS >= 5 * 60,
)

/** A run record distance's name: the half marathon, the mile, else whole kilometres. */
function distanceName(distanceM: RunRecordDistanceM): string {
  if (distanceM === HALF_MARATHON_M) return 'half marathon'
  return distanceM === METRES_PER_MILE
    ? `${distanceM / METRES_PER_MILE} mi`
    : `${distanceM / METRES_PER_KM} km`
}

export interface SportNumber {
  /** The number in the sport's own unit, with the unit: a pace for running, watts for cycling. */
  value: string
  /** The number alone, such as "7:12" or "225", for a sentence that sets the unit apart. */
  number: string
  /** The unit after the number, such as "/mi" or "W". */
  unit: string
  /** A second reading of the same number, e.g. W/kg for cycling. */
  sub: string | null
}

export interface SportRecord extends SportNumber {
  durationS: number
  /** The activity that set the record; null when it is outside the period or missing. */
  activity: ActivitySummary | null
  /**
   * How far a run covered in the record's time at its flat pace, such as "5.0 km in 20 min". A grade
   * at a duration is taken at that distance. Null for a ride, whose grade goes through its equivalent.
   */
  covered: string | null
}

/** The distance covered in a time, in the unit preference, such as "5.0 km in 20 min". */
export function coveredText(metres: number, durationS: number, units: UnitSystem): string {
  return `${formatDistance(metres, units)} in ${effortLabel(durationS)}`
}

export type Figure = Pick<SportNumber, 'value' | 'number' | 'unit'>

/** A running value (gross metabolic W/kg) as the flat pace with the same cost. */
export function paceFigure(metabolicWkg: number, units: UnitSystem): Figure {
  const speed = metabolicToFlatSpeed(metabolicWkg)
  return {
    value: formatPace(speed, units),
    number: formatPaceValue(speed, units),
    unit: PACE_UNIT[units],
  }
}

/** A running value (gross metabolic W/kg) as its flat pace. The one place a pace is formatted. */
export function runPace(metabolicWkg: number, units: UnitSystem): string {
  return paceFigure(metabolicWkg, units).value
}

/** A cycling value as mechanical watts. */
export function powerFigure(watts: number): Figure {
  return { value: formatPower(watts), number: formatWatts(watts), unit: 'W' }
}

/** The best-effort curve a sport's records come from: running W/kg, or cycling watts. */
export function curveOf(result: AnalysisResult, sport: Sport): Curve {
  return { run: result.runCurve, ride: result.rideCurve }[sport]
}

/**
 * A metabolic W/kg value as the sport's own number: the flat speed, m/s, that costs the same for
 * running, and the mechanical watts for cycling at the prior-mean efficiency.
 */
export function nativeValue(sport: Sport, metabolicWkg: number, massKg: number): number {
  return NATIVE_VALUE[sport](metabolicWkg, massKg)
}

const NATIVE_VALUE: Record<Sport, (metabolicWkg: number, massKg: number) => number> = {
  run: (metabolicWkg) => metabolicToFlatSpeed(metabolicWkg),
  ride: (metabolicWkg, massKg) =>
    metabolicToRidePower(metabolicWkg, massKg, PRIORS.grossEfficiency.mean),
}

/** A sport's best-effort curve in its own number: running in m/s, cycling in watts. */
export function nativeCurve(sport: Sport, curves: SportCurves): Curve {
  if (sport === 'ride') return curves.rideCurve
  return curves.runCurve.map((point) => ({
    durationS: point.durationS,
    value: metabolicToFlatSpeed(point.value, PRIORS.runEconomyScale.mean),
    activityId: point.activityId,
    startIndex: point.startIndex,
  }))
}

/** The value at a duration on a curve, in the curve's own unit; NaN when the curve has none there. */
export function valueAt(curve: Curve, durationS: number): number {
  return curve.find((point) => point.durationS === durationS)?.value ?? Number.NaN
}

/** The effort lengths the sport page's trend offers, as segment values and their labels. */
export const EFFORT_OPTIONS = EFFORT_LENGTHS_S.map((durationS) => ({
  value: String(durationS),
  label: effortLabel(durationS),
}))

/**
 * An effort length in copy, the one way every record, trend and headline names it: whole minutes, such
 * as "20 min" or "60 min" for an hour, and any other duration as formatDuration writes it, such as "45 s".
 */
export function effortLabel(durationS: number): string {
  return durationS % 60 === 0 ? `${durationS / 60} min` : formatDuration(durationS)
}

/** The effort length a segment value names, or undefined for a value that names none. */
export function effortOf(value: string): EffortLengthS | undefined {
  return EFFORT_LENGTHS_S.find((durationS) => String(durationS) === value)
}

/** Each activity's name by id, for the names that tooltips and tables give. */
export function activityNames(activities: ActivitySummary[]): Record<string, string> {
  return Object.fromEntries(activities.map((activity) => [activity.id, activity.name]))
}

/**
 * Estimated threshold in the sport's own unit, from the critical-power fit; null without one. The fit
 * refuses any that does not show a threshold, so the figure is shown as it was fitted.
 *
 * A ride's threshold is shown in watts, and the fit works in metabolic W/kg at the prior-mean
 * efficiency. Converting back with that same efficiency returns the fitted watts exactly, since the
 * fit is linear. Running equivalents of a ride are not worked out here: every one comes from the
 * analysis's equivalents, with their heart-rate weights and 90% range, so a ride has one running
 * equivalent on screen.
 */
export function threshold(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): SportNumber | null {
  return THRESHOLD_OF[sport](result, massKg, units)
}

/** A sport's threshold as its own figure, from its fit: null when the sport has no fit. */
type Threshold = (result: AnalysisResult, massKg: number, units: UnitSystem) => SportNumber | null
const THRESHOLD_OF: Record<Sport, Threshold> = {
  run: (result, _massKg, units) =>
    result.runCp ? { ...paceFigure(result.runCp.cp, units), sub: null } : null,
  ride: (result, massKg) => {
    if (!result.rideCp) return null
    const watts = metabolicToRidePower(result.rideCp.cp, massKg, PRIORS.grossEfficiency.mean)
    return { ...powerFigure(watts), sub: formatWkg(watts / massKg) }
  },
}

/** Why a sport has no threshold, once its efforts are there to fit: null when it has one. */
export function refusalOf(result: AnalysisResult, sport: Sport): CriticalPowerRefusal | null {
  return { run: result.runCpRefusal, ride: result.rideCpRefusal }[sport]
}

/** The best effort at each record duration, with the activity that set it. */
export function sportRecords(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): SportRecord[] {
  const curve = curveOf(result, sport)
  const byId = new Map(result.activities.map((activity) => [activity.id, activity]))
  const records: SportRecord[] = []
  for (const durationS of RECORD_DURATIONS_S[sport]) {
    const point = curve.find((candidate) => candidate.durationS === durationS)
    if (!point || !Number.isFinite(point.value)) continue
    const activity = point.activityId === null ? null : (byId.get(point.activityId) ?? null)
    records.push(
      sport === 'run'
        ? {
            durationS,
            ...paceFigure(point.value, units),
            sub: null,
            activity,
            covered: coveredText(metabolicToFlatSpeed(point.value) * durationS, durationS, units),
          }
        : {
            durationS,
            ...powerFigure(point.value),
            sub: formatWkg(point.value / massKg),
            activity,
            covered: null,
          },
    )
  }
  return records
}

/**
 * The headline effort's figure as the grade line names it, such as "6:37 /mi", with "estimated" when
 * a ride's watts did not come from a power meter, or "treadmill" when a run was held indoors. Null
 * when there is no headline effort.
 */
export function headlineEffort(sport: Sport, records: readonly SportRecord[]): string | null {
  const headline = records.find((record) => record.durationS === HEADLINE_DURATION_S)
  if (headline === undefined) return null
  if (isEstimatedRecord(sport, headline.activity)) return `${headline.value}, estimated`
  return isTreadmillRecord(sport, headline.activity)
    ? `${headline.value}, treadmill`
    : headline.value
}

export function countSport(activities: ActivitySummary[], sport: Sport): number {
  return activities.filter((activity) => activity.sport === sport).length
}

/**
 * The activities of a sport the answer can rest on: those as long as the headline effort or longer, since
 * the pick reads a best effort of that length.
 */
export function countEfforts(activities: ActivitySummary[], sport: Sport): number {
  return activities.filter(
    (activity) => activity.sport === sport && activity.durationS >= HEADLINE_DURATION_S,
  ).length
}

/** The start of a sport's latest activity of any length, or null when the library holds none of it. */
export function latestStartOf(activities: ActivitySummary[], sport: Sport): number | null {
  let latest: number | null = null
  for (const activity of activities) {
    if (activity.sport === sport && (latest === null || activity.startMs > latest)) {
      latest = activity.startMs
    }
  }
  return latest
}

/**
 * Whole calendar days from one moment to a later one, in the device's zone. A clock change inside a
 * day does not make it a day short, since each moment is taken at the start of its own day.
 */
export function calendarDaysBetween(earlierMs: number, laterMs: number): number {
  return Math.round((startOfLocalDay(laterMs) - startOfLocalDay(earlierMs)) / DAY_MS)
}

/**
 * Whether a record's figure is estimated: a ride's watts that did not come from a power meter, or
 * from an activity that is not in the result, so its power source is unknown. A run is never tagged.
 */
export function isEstimatedRecord(sport: Sport, activity: ActivitySummary | null): boolean {
  return sport === 'ride' && activity?.powerSource !== 'measured'
}

/**
 * Whether a record was set by a run held indoors, on a treadmill: such a record is marked Treadmill
 * as a ride's estimated watts are marked Estimated. A record from an unknown activity is not marked.
 */
export function isTreadmillRecord(sport: Sport, activity: ActivitySummary | null): boolean {
  return sport === 'run' && activity?.indoor === true
}

/** The equivalence to feature: 20 minutes when there is one, else the longest effort below it. */
export function featuredEquivalence(equivalents: Equivalence[]): Equivalence | null {
  const exact = equivalents.find((e) => e.durationS === HEADLINE_DURATION_S)
  if (exact) return exact
  const shorter = equivalents.filter((e) => e.durationS < HEADLINE_DURATION_S)
  return shorter.at(-1) ?? equivalents[0] ?? null
}

export interface DistanceRecord {
  distanceM: RunRecordDistanceM
  label: string
  seconds: number
  /** The time as m:ss, or h:mm:ss from an hour. */
  time: string
  /** The pace in the unit preference. */
  pace: string
  activity: ActivitySummary
}

export interface DistanceRecords {
  records: DistanceRecord[]
  /** True when some runs in scope were digested before distance bests, so the list may be short. */
  partial: boolean
}

/** Whether a starts before b: the earlier start first, then the smaller id, as in the analysis. */
function startsBefore(a: ActivitySummary, b: ActivitySummary): boolean {
  if (a.startMs !== b.startMs) return a.startMs < b.startMs
  return a.id < b.id
}

/**
 * The fastest run at each record distance among the activities in scope. A tie goes to the earlier
 * activity. Runs with no distance bests are not counted as having none, so `partial` tells the page
 * the list may be incomplete.
 */
export function distanceRecords(activities: ActivitySummary[], units: UnitSystem): DistanceRecords {
  const runs = activities.filter((activity) => activity.sport === 'run')
  const covered = runs.filter((activity) => activity.distanceBests !== undefined)
  const records: DistanceRecord[] = []
  for (const distanceM of RUN_RECORD_DISTANCES_M) {
    let best: { seconds: number; activity: ActivitySummary } | null = null
    for (const activity of covered) {
      const seconds = activity.distanceBests?.find((b) => b.distanceM === distanceM)?.seconds
      if (seconds === undefined) continue
      if (best === null || seconds < best.seconds) best = { seconds, activity }
      else if (seconds === best.seconds && startsBefore(activity, best.activity)) {
        best = { seconds, activity }
      }
    }
    if (best !== null) records.push(distanceRecordOf(distanceM, best.seconds, best.activity, units))
  }
  return { records, partial: covered.length > 0 && covered.length < runs.length }
}

/** A run's time over one record distance, with the activity that ran it. */
function distanceRecordOf(
  distanceM: RunRecordDistanceM,
  seconds: number,
  activity: ActivitySummary,
  units: UnitSystem,
): DistanceRecord {
  return {
    distanceM,
    label: distanceName(distanceM),
    seconds,
    time: formatRecordTime(seconds),
    pace: formatPace(distanceM / seconds, units),
    activity,
  }
}

/** Whether a distance's pace is its time: the mile in miles, or the kilometre in kilometres. */
export function paceIsTime(distanceM: number, units: UnitSystem): boolean {
  return distanceM === (units === 'imperial' ? METRES_PER_MILE : METRES_PER_KM)
}

/** Whether a distance is one that a run record is kept for. */
function isRunRecordDistance(distanceM: number): distanceM is RunRecordDistanceM {
  return RUN_RECORD_DISTANCES_M.some((record) => record === distanceM)
}

/**
 * The run distances one activity has its own time at, in ascending distance. These are its own
 * times, not all of them records; a ride has none.
 */
export function ownDistanceRecords(activity: ActivitySummary, units: UnitSystem): DistanceRecord[] {
  return (activity.distanceBests ?? []).flatMap((best) =>
    isRunRecordDistance(best.distanceM)
      ? [distanceRecordOf(best.distanceM, best.seconds, activity, units)]
      : [],
  )
}

/** The chip text for each record that earns one, in the order the records come. */
export function chipLabels(records: readonly EarnedRecord[]): string[] {
  const labels: string[] = []
  for (const record of records) {
    if (record.kind === 'distance') {
      labels.push(`Best ${distanceName(record.distanceM)}`)
    } else if (CHIP_DURATIONS_S.includes(record.durationS)) {
      labels.push(`Best ${effortLabel(record.durationS)}`)
    }
  }
  return labels
}
