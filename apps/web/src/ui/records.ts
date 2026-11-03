import { HEADLINE_DURATION_S, PRIORS } from '@rca/core/constants'
export { CURVE_START_S } from '@rca/core/profile'
export { calendarDaysBetween, latestStartOf } from './activityDates'
export { distanceRecords, ownDistanceRecords, paceIsTime } from './distanceRecords'
export type { DistanceRecord, DistanceRecords } from './distanceRecords'
import type { EarnedRecord } from '@rca/core/records'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import type { SportCurves } from '@rca/core/digest'
import type { ActivitySummary, AnalysisResult, Equivalence } from '@rca/core/pipeline'
import type { Curve, Sport } from '@rca/core/types'
import { EFFORT_LENGTHS_S } from '@rca/core/digest/trendPoints'
import type { EffortLengthS } from '@rca/core/digest/trendPoints'
import type { UnitSystem } from '@rca/core/units'
import { distanceName } from './distanceRecords'
import { thresholdEstimate } from './thresholdEstimate'
import {
  formatPace,
  formatPaceValue,
  formatPower,
  formatWatts,
  formatWkg,
  PACE_UNIT,
  formatDistance,
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

/**
 * The durations that earn a chip, and that a Balance card lists: 5, 20 and 60 minutes. A ride's
 * one-minute best is page-only.
 */
export const CHIP_DURATIONS_S: readonly number[] = RECORD_DURATIONS_S.ride.filter(
  (durationS) => durationS >= 5 * 60,
)

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
    // Kept so the chart can tell a longer effort's value, carried down by the envelope, from a measured one.
    windowS: point.windowS,
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
 * Estimated threshold in the sport's own unit; null without one. Each sport's is the best estimate from every one of its
 * activities' efforts (`runThreshold`, `rideThreshold`: the strongest effort of each, scaled to an hour and averaged), which
 * is null only where the sport has no effort of 3 min or more.
 *
 * A ride's threshold is shown in watts, and the estimate works in metabolic W/kg at the prior-mean
 * efficiency. Converting back with that same efficiency returns the estimated watts exactly, since the
 * conversion is linear. Running equivalents of a ride are not worked out here: every one comes from the
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

/** A ride's threshold value (gross metabolic W/kg) as the watts it is shown in, with W/kg beside it. */
export function rideThresholdFigure(metabolicWkg: number, massKg: number): SportNumber {
  const watts = metabolicToRidePower(metabolicWkg, massKg, PRIORS.grossEfficiency.mean)
  return { ...powerFigure(watts), sub: formatWkg(watts / massKg) }
}

/** A sport's threshold as its own figure: null when the sport has none. */
type Threshold = (result: AnalysisResult, massKg: number, units: UnitSystem) => SportNumber | null
const THRESHOLD_OF: Record<Sport, Threshold> = {
  run: (result, _massKg, units) => {
    const estimate = thresholdEstimate(result, 'run')
    return estimate ? { ...paceFigure(estimate.value, units), sub: null } : null
  },
  ride: (result, massKg) => {
    const estimate = thresholdEstimate(result, 'ride')
    return estimate ? rideThresholdFigure(estimate.value, massKg) : null
  },
}

/** Whether a sport has a threshold: it has an effort of 3 min or more. */
export function hasThreshold(result: AnalysisResult, sport: Sport): boolean {
  return thresholdEstimate(result, sport) !== null
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
            // With dated body masses the ride is priced at the mass on its own date.
            sub: formatWkg(point.value / (activity?.massKg ?? massKg)),
            activity,
            covered: null,
          },
    )
  }
  return records
}

/** What follows a headline effort's figure when a ride's watts did not come from a power meter: "250 W, estimated". */
export const ESTIMATED_EFFORT_SUFFIX = ', estimated'

/** A headline effort's figure without its estimate word, for a line that leaves the estimate to the ring. */
export function plainEffort(effort: string): string {
  return effort.endsWith(ESTIMATED_EFFORT_SUFFIX)
    ? effort.slice(0, -ESTIMATED_EFFORT_SUFFIX.length)
    : effort
}

/**
 * The headline effort's figure as the grade line names it, such as "6:37 /mi", with "estimated" when
 * a ride's watts did not come from a power meter. Null when there is no headline effort.
 */
export function headlineEffort(sport: Sport, records: readonly SportRecord[]): string | null {
  const headline = records.find((record) => record.durationS === HEADLINE_DURATION_S)
  if (headline === undefined) return null
  return isEstimatedRecord(sport, headline.activity)
    ? `${headline.value}${ESTIMATED_EFFORT_SUFFIX}`
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

/**
 * Whether a record's figure is estimated: a ride's watts that did not come from a power meter, or
 * from an activity that is not in the result, so its power source is unknown. A run is never tagged.
 */
export function isEstimatedRecord(sport: Sport, activity: ActivitySummary | null): boolean {
  return sport === 'ride' && activity?.powerSource !== 'measured'
}

/** The equivalence to feature: 20 minutes when there is one, else the longest effort below it. */
export function featuredEquivalence(equivalents: Equivalence[]): Equivalence | null {
  const exact = equivalents.find((e) => e.durationS === HEADLINE_DURATION_S)
  if (exact) return exact
  const shorter = equivalents.filter((e) => e.durationS < HEADLINE_DURATION_S)
  return shorter.at(-1) ?? equivalents[0] ?? null
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
