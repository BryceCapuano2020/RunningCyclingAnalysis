import { HEADLINE_DURATION_S, PRIORS } from '@rca/core/constants'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import type { SportCurves } from '@rca/core/digest'
import type { ActivitySummary, AnalysisResult, Equivalence } from '@rca/core/pipeline'
import type { Curve, Sport } from '@rca/core/types'
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
} from '@rca/core/units'

/** The durations each sport page lists as records: 1, 5, 20 and 60 minutes. */
export const RECORD_DURATIONS_S = [60, 300, 1200, 3600] as const

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
}

type Figure = Pick<SportNumber, 'value' | 'number' | 'unit'>

/**
 * A running value (gross metabolic W/kg) as the flat pace with the same cost, which athletes know
 * as grade-adjusted pace.
 */
function paceFigure(metabolicWkg: number, units: UnitSystem): Figure {
  const speed = metabolicToFlatSpeed(metabolicWkg)
  return {
    value: formatPace(speed, units),
    number: formatPaceValue(speed, units),
    unit: PACE_UNIT[units],
  }
}

/**
 * A running value (gross metabolic W/kg) as the flat pace with the same cost, which athletes know
 * as grade-adjusted pace. The one place a pace is formatted: the figure's value.
 */
export function runPace(metabolicWkg: number, units: UnitSystem): string {
  return paceFigure(metabolicWkg, units).value
}

/** A cycling value as mechanical watts. */
function powerFigure(watts: number): Figure {
  return { value: formatPower(watts), number: formatWatts(watts), unit: 'W' }
}

/** The best-effort curve a sport's records come from: running W/kg, or cycling watts. */
export function curveOf(result: AnalysisResult, sport: Sport): Curve {
  return sport === 'run' ? result.runCurve : result.rideCurve
}

/**
 * A metabolic W/kg value as the sport's own number: the flat speed, m/s, that costs the same for
 * running, and the mechanical watts for cycling at the prior-mean efficiency.
 */
export function nativeValue(sport: Sport, metabolicWkg: number, massKg: number): number {
  return sport === 'run'
    ? metabolicToFlatSpeed(metabolicWkg)
    : metabolicToRidePower(metabolicWkg, massKg, PRIORS.grossEfficiency.mean)
}

/** A sport's best-effort curve in its own number: running in m/s, cycling in watts. */
export function nativeCurve(sport: Sport, curves: SportCurves): Curve {
  if (sport === 'ride') return curves.rideCurve
  return curves.runCurve.map((point) => ({
    durationS: point.durationS,
    value: metabolicToFlatSpeed(point.value),
    activityId: point.activityId,
    startIndex: point.startIndex,
  }))
}

/** The effort lengths the sport page's trend offers, as segment values and their labels. */
export const EFFORT_OPTIONS = EFFORT_LENGTHS_S.map((durationS) => ({
  value: String(durationS),
  label: `${durationS / 60} min`,
}))

/** The effort length a segment value names, or undefined for a value that names none. */
export function effortOf(value: string): EffortLengthS | undefined {
  return EFFORT_LENGTHS_S.find((durationS) => String(durationS) === value)
}

/** Each activity's name by id, for the names that tooltips and tables give. */
export function activityNames(activities: ActivitySummary[]): Record<string, string> {
  return Object.fromEntries(activities.map((activity) => [activity.id, activity.name]))
}

/** Estimated threshold in the sport's own unit, from the critical-power fit; null without one. */
export function threshold(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): SportNumber | null {
  if (sport === 'run') {
    return result.runCp ? { ...paceFigure(result.runCp.cp, units), sub: null } : null
  }
  if (!result.rideCp) return null
  const watts = metabolicToRidePower(result.rideCp.cp, massKg, PRIORS.grossEfficiency.mean)
  return { ...powerFigure(watts), sub: formatWkg(watts / massKg) }
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
  for (const durationS of RECORD_DURATIONS_S) {
    const point = curve.find((candidate) => candidate.durationS === durationS)
    if (!point || !Number.isFinite(point.value)) continue
    const activity = point.activityId === null ? null : (byId.get(point.activityId) ?? null)
    records.push(
      sport === 'run'
        ? { durationS, ...paceFigure(point.value, units), sub: null, activity }
        : {
            durationS,
            ...powerFigure(point.value),
            sub: formatWkg(point.value / massKg),
            activity,
          },
    )
  }
  return records
}

export function countSport(activities: ActivitySummary[], sport: Sport): number {
  return activities.filter((activity) => activity.sport === sport).length
}

/** The equivalence to feature: 20 minutes when there is one, else the longest effort below it. */
export function featuredEquivalence(equivalents: Equivalence[]): Equivalence | null {
  const exact = equivalents.find((e) => e.durationS === HEADLINE_DURATION_S)
  if (exact) return exact
  const shorter = equivalents.filter((e) => e.durationS < HEADLINE_DURATION_S)
  return shorter.at(-1) ?? equivalents[0] ?? null
}
