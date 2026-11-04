import { PRIORS } from '../constants'
import {
  flatSpeedToMetabolic,
  metabolicToFlatSpeed,
  metabolicToRidePower,
  ridePowerToMetabolic,
  runMetabolicPower,
} from '../metabolic'
import { DURATION_TABLES } from '../threshold/durationTables'
import type { Sport } from '../types'
import { DISPLAY_ECONOMY } from './economy'

/*
 * The one set of conversions a figure goes through to be shown: gross metabolic W/kg (the unit of the best curves and the
 * thresholds) into a sport's own number (a flat running speed, watts) and back, and a power into W/kg. The web names and
 * formats what these return and does no conversion of its own, so a figure shown in two places cannot be worked out two ways
 * (docs/ENGINEERING.md, "One figure, one function"). apps/web/src is held to this by scripts/ops/figure-sources.test.mjs.
 */

/** The flat running speed, m/s, that costs a gross metabolic W/kg. */
export function flatSpeedOfWkg(metabolicWkg: number): number {
  return metabolicToFlatSpeed(metabolicWkg, DISPLAY_ECONOMY)
}

/** The gross metabolic W/kg of running on the flat at a speed, m/s. */
export function wkgOfFlatSpeed(speedMs: number): number {
  return flatSpeedToMetabolic(speedMs, DISPLAY_ECONOMY)
}

/** The mechanical watts a gross metabolic W/kg costs a rider of massKg, at the prior-mean gross efficiency. */
export function ridePowerOfWkg(metabolicWkg: number, massKg: number): number {
  return metabolicToRidePower(metabolicWkg, massKg, PRIORS.grossEfficiency.mean)
}

/** The gross metabolic W/kg of riding at watts, for a rider of massKg, at the prior-mean gross efficiency. */
export function wkgOfRidePower(watts: number, massKg: number): number {
  return ridePowerToMetabolic(watts, massKg, PRIORS.grossEfficiency.mean)
}

/** Mechanical watts per kg of body mass, the W/kg a ride is stated in. */
export function wattsPerKg(watts: number, massKg: number): number {
  return watts / massKg
}

/**
 * A ride threshold as the figures the pages state: its watts at the athlete's mass today and the same per kg. The one place a
 * threshold becomes watts, so the tile, the sport page, the curve, the range and the cross-sport card read one number.
 */
export function ridePowerAt(
  metabolicWkg: number,
  massKg: number,
): { watts: number; wattsPerKg: number } {
  const watts = ridePowerOfWkg(metabolicWkg, massKg)
  return { watts, wattsPerKg: wattsPerKg(watts, massKg) }
}

/** A sport's own number for a gross metabolic W/kg: a run's flat speed in m/s, a ride's watts at massKg. */
const NATIVE: Record<Sport, (metabolicWkg: number, massKg: number) => number> = {
  run: (metabolicWkg) => flatSpeedOfWkg(metabolicWkg),
  ride: ridePowerOfWkg,
}

/** A gross metabolic W/kg as the sport's own number: the flat speed that costs the same for a run, watts at massKg for a ride. */
export function nativeOfWkg(sport: Sport, metabolicWkg: number, massKg: number): number {
  return NATIVE[sport](metabolicWkg, massKg)
}

/**
 * A run's metabolic W/kg at each second, from its speed and grade, as the best efforts are read (a steep descent saves what
 * `descentCost` says), at the display scale. What a stretch's flat pace is worked back from.
 */
export function runWkgOfTrace(speedMs: Float64Array, grade: Float64Array): Float64Array {
  return runMetabolicPower(speedMs, grade, DISPLAY_ECONOMY, { steepDescent: true })
}

/** The shortest effort a sport's threshold reads, in minutes, for copy that asks for one: 3 for a ride, 8 for a run. */
export function shortestEffortMin(sport: Sport): number {
  return DURATION_TABLES[sport].shortestS / 60
}
