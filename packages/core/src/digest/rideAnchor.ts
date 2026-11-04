import { PRIORS } from '../constants'
import { ageStandardSeconds } from '../grade/ageGrade'
import type { Sex } from '../grade/ageGrade'
import {
  flatSpeedToMetabolic,
  metabolicToFlatSpeed,
  metabolicToRidePower,
  ridePowerToMetabolic,
} from '../metabolic'
import { HOUR_S } from '../threshold/constants'
import type { Interval } from '../types'

/*
 * A ride's running equivalent, anchored at each sport's world class. A ride is graded the way a run is, as a share of what the
 * best athletes of its own sport hold: a rider at the same share of the best riders' hour as a runner is of the best runners'
 * hour gets the same grade. The earlier rule priced a ride at an assumed gross efficiency and read the run of equal energy; at
 * 21.5% a world-class hour on the bike costs more energy than the world-class running hour, so every ride graded about a fifth
 * high. docs/design/cross-sport.md has the argument and the sensitivity.
 */

/**
 * The cycling world-class hour, W/kg: the top of the FTP column of Coggan's power profile table (Allen and Coggan, Training and
 * Racing with a Power Meter), 6.40 for men and 5.69 for women. The men's value differs between reprints (6.40 in one, 6.60 in
 * another); CYCLING_ANCHOR_LOG_SD carries that disagreement.
 */
export const CYCLING_WORLD_CLASS_HOUR_WKG: Record<Sex, number> = { male: 6.4, female: 5.69 }

/**
 * The spread of the anchor on the log scale of energy: 0.03, a little over the 3% between the men's two published values
 * (6.40 and 6.60). A ride's range through the anchor is exp(+-1.645 x this) on its energy, the 5th and 95th percentiles.
 */
export const CYCLING_ANCHOR_LOG_SD = 0.03

/** The z of the 95th percentile of a normal, and so, mirrored, of the 5th: the ends of the ranges this module returns. */
const Z_P95 = 1.645

/** The z of the 90th percentile: the ends (`low`, `high`) a threshold estimate carries are its 10th and 90th percentiles. */
const Z_P90 = 1.2816

/**
 * An age at which both sexes' road standards hold the open class at an hour: nobody's age-standard time at 3600 s is faster
 * (the tests check each age against it). The world-class running hour is read here, so the age tables' own age curve is left
 * to the grade.
 */
export const OPEN_AGE = 25

/**
 * The flat running speed the road standard holds for an hour in the open age, m/s: the speed at which `gradeAtSpeed` grades
 * 100% at 3600 s. Found by bisection once per sex, since the standards are a table the speed has no closed form for.
 */
const worldClassHourSpeeds = new Map<Sex, number>()

export function worldClassRunHourSpeed(sex: Sex): number {
  const found = worldClassHourSpeeds.get(sex)
  if (found !== undefined) return found
  // The standard time at the distance an hour covers at speed v rises with v, so the grade 1 speed is where it meets 3600 s.
  let slow = 1
  let fast = 15
  for (let step = 0; step < 80; step++) {
    const middle = (slow + fast) / 2
    const standard = ageStandardSeconds(middle * HOUR_S, OPEN_AGE, sex)
    if (standard !== null && standard < HOUR_S) slow = middle
    else fast = middle
  }
  const speed = (slow + fast) / 2
  worldClassHourSpeeds.set(sex, speed)
  return speed
}

/**
 * The factor that turns a ride's gross metabolic W/kg, priced at the prior-mean efficiency, into the energy of the run that is
 * the same share of the running world-class hour: the metabolic cost of that hour over the cycling world-class hour's metabolic
 * W/kg at the same efficiency. The efficiency cancels, so it does not matter what it is, and a ride at the cycling
 * world-class hour maps to the running one. With no sex given the men's anchor is used, as the heart-rate reference does; the
 * two differ by a few percent.
 */
export function anchorFactor(sex: Sex | null | undefined): number {
  const who: Sex = sex === 'female' ? 'female' : 'male'
  const efficiency = PRIORS.grossEfficiency.mean
  const cyclingHour = ridePowerToMetabolic(CYCLING_WORLD_CLASS_HOUR_WKG[who], 1, efficiency)
  return flatSpeedToMetabolic(worldClassRunHourSpeed(who)) / cyclingHour
}

/** A ride's figure as it stands and the ends the caller gives it: gross metabolic W/kg at the prior-mean efficiency. */
export interface RideEnergy {
  value: number
  /** The 10th percentile of the caller's own range, at most `value`; absent, the figure has no range of its own. */
  low?: number
  /** The 90th percentile, at least `value`. */
  high?: number
}

/**
 * How far an end is from the value on the log scale, as a 5th or 95th percentile would be: the caller's ends are 10th and 90th
 * percentiles, so their distance is scaled by 1.645 / 1.2816 to the same percentiles as the anchor's. An absent end, or one that
 * is not a positive figure, is no distance. The distance is absolute, so an end on the wrong side of the value widens the range
 * the same as one on the right side.
 */
function logDistance(value: number, end: number | undefined): number {
  return end === undefined || !(end > 0) ? 0 : (Math.abs(Math.log(value / end)) * Z_P95) / Z_P90
}

/**
 * A ride's running equivalent: the flat running speed, m/s, of the run that is the same share of the running world-class hour
 * as the ride is of the cycling one, at any duration. The ends are the 5th and 95th percentiles: the anchor's (exp(+-1.645 x
 * CYCLING_ANCHOR_LOG_SD) on the energy), widened in quadrature on the log scale by the caller's own `low` and `high` when it has
 * them. Those are the 10th and 90th percentiles of a threshold estimate, so their distances from the value are first scaled by
 * 1.645 / 1.2816 to the 5th and 95th, and a threshold's range and the anchor's are then one range. Age is left to the running age tables, since cycling ages like running in energy terms.
 */
export function rideRunSpeed(ride: RideEnergy, sex: Sex | null | undefined): Interval {
  const factor = anchorFactor(sex)
  const anchor = Z_P95 * CYCLING_ANCHOR_LOG_SD
  const speedAt = (energy: number) => metabolicToFlatSpeed(factor * energy)
  const down = Math.hypot(logDistance(ride.value, ride.low), anchor)
  const up = Math.hypot(logDistance(ride.value, ride.high), anchor)
  return {
    p05: speedAt(ride.value * Math.exp(-down)),
    p50: speedAt(ride.value),
    p95: speedAt(ride.value * Math.exp(up)),
  }
}

/**
 * The running equivalent of riding at `ridePowerW` at `massKg`, for one sex. The mass cancels: a ride is priced at the mass it
 * was ridden at, and what it is worth is its power per kilogram.
 */
export function equivalenceFor(
  sex: Sex | null | undefined,
): (ridePowerW: number, massKg: number) => Interval {
  return (ridePowerW, massKg) =>
    rideRunSpeed(
      { value: ridePowerToMetabolic(ridePowerW, massKg, PRIORS.grossEfficiency.mean) },
      sex,
    )
}

/** The running equivalent of riding at `ridePowerW` at `massKg`: the one-off form of `equivalenceFor`. */
export function equivalentRunSpeed(
  ridePowerW: number,
  massKg: number,
  sex: Sex | null | undefined,
): Interval {
  return equivalenceFor(sex)(ridePowerW, massKg)
}

/**
 * The power, W, whose running equivalent (`rideRunSpeed`, anchor alone) is a flat running speed at the body mass `massKg`: the
 * inverse of `equivalenceFor`, with the watts that reach the speed at the equivalence's 95th and 5th percentiles as `low` and
 * `high`. The equivalence is a closed form, so so is its inverse.
 */
export function ridePowerForRunSpeed(
  speedMs: number,
  massKg: number,
  sex: Sex | null | undefined,
): { low: number; centre: number; high: number } {
  const energy = flatSpeedToMetabolic(speedMs) / anchorFactor(sex)
  const watts = (wkg: number) => metabolicToRidePower(wkg, massKg, PRIORS.grossEfficiency.mean)
  const spread = Math.exp(Z_P95 * CYCLING_ANCHOR_LOG_SD)
  return { low: watts(energy / spread), centre: watts(energy), high: watts(energy * spread) }
}
