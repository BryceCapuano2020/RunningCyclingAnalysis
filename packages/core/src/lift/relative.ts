/**
 * Relative strength: an estimate over the body mass in effect on its date (docs/design/e1rm.md, section 4).
 * Two figures, each with a range that carries the mass error.
 */
import { bodyMassOn, entryAt, hasDatedMass, localDayStartMs } from '../athlete'
import type { AthleteSettings } from '../athlete'
import {
  ALLOMETRIC_EXPONENT,
  MASS_MAX_AGE_DAYS,
  MASS_SD_BASE,
  MASS_SD_MAX,
  MASS_SD_PER_30_DAYS,
} from './constants'
import { dayOfLiftDate, rangeOf } from './estimate'
import type { LiftEstimate } from './estimate'

export interface RelativeFigure {
  point: number
  low: number
  high: number
}

export interface RelativeStrength {
  /** Body mass used, kg. */
  massKg: number
  /** Days between the mass entry and the estimate; null for a profile mass with no date. */
  massAgeDays: number | null
  /** Mass error in log units. */
  massSd: number
  /** e1RM / mass: times body mass. */
  ratio: RelativeFigure
  /** e1RM / mass^0.67: for comparing across a change in body mass. */
  allometric: RelativeFigure
}

/** Mass error in log units for an entry this many days from the estimate. */
export function massSdFor(ageDays: number | null): number {
  if (ageDays === null) return MASS_SD_MAX
  return Math.min(MASS_SD_BASE + MASS_SD_PER_30_DAYS * (ageDays / 30), MASS_SD_MAX)
}

/** The mass and its age on a date: the dated entry in effect, else the profile's (age null), else none. */
function massOn(
  settings: AthleteSettings,
  date: string,
): { massKg: number; ageDays: number | null } | null {
  const measurements = settings.measurements ?? []
  const at = localDayStartMs(date)
  const massKg = bodyMassOn(null, measurements, at)
  if (hasDatedMass(settings)) {
    const entry = entryAt(measurements, 'massKg', undefined, at)
    const age = Math.abs(dayOfLiftDate(date) - dayOfLiftDate(entry?.from ?? date))
    return massKg === null || age > MASS_MAX_AGE_DAYS ? null : { massKg, ageDays: age }
  }
  // The profile mass has no date. A placeholder (massAssumed) is not a mass the athlete entered.
  if (settings.massAssumed || !(settings.massKg > 0)) return null
  return { massKg: settings.massKg, ageDays: null }
}

function figure(est: LiftEstimate, divisor: number, sd: number, deadlift: boolean): RelativeFigure {
  const point = est.point / divisor
  const range = rangeOf(est.point0 / divisor, sd, est.floor.loadKg / divisor, point, deadlift)
  return { point, ...range }
}

/** Relative strength of an estimate, or null with no usable mass (none, a placeholder, or an entry over 365 days away). */
export function relativeStrength(
  est: LiftEstimate,
  settings: AthleteSettings,
  deadlift = false,
): RelativeStrength | null {
  const mass = massOn(settings, est.date)
  if (!mass) return null
  const massSd = massSdFor(mass.ageDays)
  return {
    massKg: mass.massKg,
    massAgeDays: mass.ageDays,
    massSd,
    ratio: figure(est, mass.massKg, Math.hypot(est.sd, massSd), deadlift),
    allometric: figure(
      est,
      Math.pow(mass.massKg, ALLOMETRIC_EXPONENT),
      Math.hypot(est.sd, ALLOMETRIC_EXPONENT * massSd),
      deadlift,
    ),
  }
}
