import { HEADLINE_DURATION_S, PRIORS } from '@rca/core/constants'
import { metabolicToFlatSpeed, metabolicToRidePower } from '@rca/core/metabolic'
import type { ActivitySummary, AnalysisResult, Equivalence } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace, formatPower, formatWkg } from '@rca/core/units'

/** The durations each sport page lists as records: 1, 5, 20 and 60 minutes. */
export const RECORD_DURATIONS_S = [60, 300, 1200, 3600] as const

export interface SportNumber {
  /** The number in the sport's own unit: a pace for running, watts for cycling. */
  value: string
  /** A second reading of the same number, e.g. W/kg for cycling. */
  sub: string | null
}

export interface SportRecord extends SportNumber {
  durationS: number
  /** The activity that set the record; null when it is outside the period or missing. */
  activity: ActivitySummary | null
}

/**
 * A running value (gross metabolic W/kg) as the flat pace with the same cost, which athletes know
 * as grade-adjusted pace; a cycling value as mechanical watts.
 */
export function runPace(metabolicWkg: number, units: UnitSystem): string {
  return formatPace(metabolicToFlatSpeed(metabolicWkg), units)
}

/** Estimated threshold in the sport's own unit, from the critical-power fit; null without one. */
export function threshold(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): SportNumber | null {
  if (sport === 'run') {
    return result.runCp ? { value: runPace(result.runCp.cp, units), sub: null } : null
  }
  if (!result.rideCp) return null
  const watts = metabolicToRidePower(result.rideCp.cp, massKg, PRIORS.grossEfficiency.mean)
  return { value: formatPower(watts), sub: formatWkg(watts / massKg) }
}

/** The best effort at each record duration, with the activity that set it. */
export function sportRecords(
  result: AnalysisResult,
  sport: Sport,
  massKg: number,
  units: UnitSystem,
): SportRecord[] {
  const curve = sport === 'run' ? result.runCurve : result.rideCurve
  const byId = new Map(result.activities.map((activity) => [activity.id, activity]))
  const records: SportRecord[] = []
  for (const durationS of RECORD_DURATIONS_S) {
    const point = curve.find((candidate) => candidate.durationS === durationS)
    if (!point || !Number.isFinite(point.value)) continue
    const activity = point.activityId === null ? null : (byId.get(point.activityId) ?? null)
    records.push(
      sport === 'run'
        ? { durationS, value: runPace(point.value, units), sub: null, activity }
        : {
            durationS,
            value: formatPower(point.value),
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
