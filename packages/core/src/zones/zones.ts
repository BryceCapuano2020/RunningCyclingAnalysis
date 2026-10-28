import { massAtFor } from '../athlete/mass'
import { entryAt } from '../athlete/measurements'
import type { AthleteSettings } from '../athlete/settings'
import { PRIORS } from '../constants'
import type { AnalysisResult } from '../digest/combine'
import { metabolicToFlatSpeed, metabolicToRidePower } from '../metabolic'
import type { Sport } from '../types'
import { ZONE_MEASURES, ZONE_OVERRIDE, ZONE_SCHEMES } from './schemes'
import type { ZoneMeasure } from './schemes'

/**
 * One zone, in the measure's unit: watts, bpm, or running speed in m/s. It holds the values from
 * `low` up to, not including, `high`. The lowest zone starts at 0, and the highest has no upper
 * limit (`high` is null), so every reading falls in exactly one zone.
 */
export interface Zone {
  /** 1 for the lowest effort. */
  level: number
  name: string
  low: number
  high: number | null
}

/**
 * Where a zone set's reference came from: `entered` is a dated setting the athlete typed, and
 * `estimated` is the app's own figure from the activities (critical power, or the reference heart rate).
 */
export type ZoneSource = 'entered' | 'estimated'

export interface ZoneSet {
  sport: Sport
  measure: ZoneMeasure
  source: ZoneSource
  /** Threshold power W, maximum heart rate bpm, or threshold speed m/s that the zones are cut from. */
  reference: number
  /** The published scheme, for the line under the table. */
  citation: string
  zones: Zone[]
}

/** The zones of a measure for a reference value, by the published scheme. */
export function zonesFor(measure: ZoneMeasure, reference: number): Zone[] {
  const { names, cuts } = ZONE_SCHEMES[measure]
  return names.map((name, i) => ({
    level: i + 1,
    name,
    low: i === 0 ? 0 : reference * cuts[i - 1]!,
    high: i === cuts.length ? null : reference * cuts[i]!,
  }))
}

/** What an analysis offers as references: the threshold fits and the reference heart rates. */
export type ZoneEstimates = Pick<
  AnalysisResult,
  'runCp' | 'rideCp' | 'runMaxHeartRate' | 'rideMaxHeartRate'
>

type Estimate = (estimates: ZoneEstimates, massKg: number) => number | null

/**
 * The app's own reference for each sport and measure, null without one. A ride's threshold is a
 * metabolic W/kg fit, so it becomes watts at the athlete's mass on the date asked for.
 */
const ESTIMATE: Record<Sport, Partial<Record<ZoneMeasure, Estimate>>> = {
  run: {
    heartRate: (e) => e.runMaxHeartRate,
    pace: (e) => (e.runCp ? metabolicToFlatSpeed(e.runCp.cp) : null),
  },
  ride: {
    heartRate: (e) => e.rideMaxHeartRate,
    power: (e, massKg) =>
      e.rideCp ? metabolicToRidePower(e.rideCp.cp, massKg, PRIORS.grossEfficiency.mean) : null,
  },
}

/**
 * The zones in effect on a date, for every sport and measure that has a reference. Time-in-zones and
 * any other feature that needs zones asks here with an activity's start.
 *
 * A dated setting the athlete entered (settings.measurements) wins: the entry in effect on the local
 * date, by the policy on Measurement. Otherwise the zones come from `estimates`, the analysis the
 * athlete is looking at, and are marked estimated. A sport and measure with neither are left out.
 */
export function zonesAt(
  at: number,
  settings: AthleteSettings,
  estimates: ZoneEstimates | null,
): ZoneSet[] {
  const massKg = massAtFor(settings)(at)
  const sets: ZoneSet[] = []
  for (const sport of Object.keys(ZONE_MEASURES) as Sport[]) {
    for (const measure of ZONE_MEASURES[sport]) {
      const entered = entryAt(settings.measurements ?? [], ZONE_OVERRIDE[measure], sport, at)
      const estimate = estimates === null ? null : ESTIMATE[sport][measure]?.(estimates, massKg)
      const source: ZoneSource = entered === null ? 'estimated' : 'entered'
      const reference = entered?.value ?? estimate ?? null
      if (reference === null || !Number.isFinite(reference) || reference <= 0) continue
      sets.push({
        sport,
        measure,
        source,
        reference,
        citation: ZONE_SCHEMES[measure].citation,
        zones: zonesFor(measure, reference),
      })
    }
  }
  return sets
}
