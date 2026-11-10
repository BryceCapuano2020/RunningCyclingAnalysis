/**
 * The world-class lift in kg for an athlete's age, sex and body mass (docs/design/lift-grade.md, section 4), and which
 * of the three graded lifts an exercise is. The numbers are in `standard.ts`.
 */
import { civilOfDay, dayOfCivil } from '../../calendar'
import type { Sex } from '../../grade/ageGrade'
import { dayOfLiftDate } from '../estimate'
import type { Equipment } from '../types'
import {
  AGE_RANGE,
  CURVES,
  JUNIOR_START_AGE,
  MASS_RANGE_KG,
  REF_MASS_KG,
  WORLD_SHARE,
} from './standard'
import type { GradedLift } from './standard'

/** The competition lift an exercise slug stands for. A front squat, a box squat or a press of another kind has none. */
const LIFT_OF_SLUG: Record<string, GradedLift> = {
  'back-squat': 'squat',
  'bench-press': 'bench',
  deadlift: 'deadlift',
  'sumo-deadlift': 'deadlift',
}

/** The graded lift of a barbell exercise, or null: the standard is for the barbell lifts only. */
export function gradedLiftOf(exercise: string, equipment: Equipment): GradedLift | null {
  if (equipment !== 'barbell') return null
  return Object.hasOwn(LIFT_OF_SLUG, exercise) ? (LIFT_OF_SLUG[exercise] as GradedLift) : null
}

/**
 * The age on a date from the birth year alone: the calendar years' difference less a half, plus the share of the year gone
 * (day of year less a half, over 365). The mean age for a birthday uniform in the year.
 */
export function liftAgeOn(birthYear: number, date: string): number {
  const day = dayOfLiftDate(date)
  const year = civilOfDay(day).year
  const dayOfYear = day - dayOfCivil(year, 0, 1) + 1
  return year - birthYear - 0.5 + (dayOfYear - 0.5) / 365
}

export interface LiftStandard {
  kg: number
  /** Age or mass was outside the fitted range and was held at its edge. */
  outOfRange: boolean
}

const clamp = (v: number, [lo, hi]: readonly [number, number]): number =>
  Math.min(hi, Math.max(lo, v))

/**
 * S for a lift, sex, age (years) and mass. Age and mass are held at the fitted range, `outOfRange` saying so. S never falls
 * as mass rises: where the fitted quadratic turns over, S is held flat.
 */
export function liftStandard(
  lift: GradedLift,
  sex: Sex,
  age: number,
  massKg: number,
): LiftStandard {
  const q = CURVES[lift][sex]
  const massRange = MASS_RANGE_KG[sex]
  const a = clamp(age, AGE_RANGE)
  const m = clamp(massKg, massRange)
  let x = Math.log(m / REF_MASS_KG[sex])
  // Past the peak of a falling quadratic S is held flat (no fitted curve peaks inside the fitted masses; this is a guard).
  if (q.c < 0) x = Math.min(x, -q.b / (2 * q.c))
  const past = Math.max(a - q.P, 0)
  const lnS =
    q.a +
    q.b * x +
    q.c * x * x +
    Math.log(1 - Math.exp(-(a - JUNIOR_START_AGE) / q.k)) -
    q.d1 * past -
    q.d2 * past * past
  return { kg: Math.exp(lnS) / WORLD_SHARE, outOfRange: a !== age || m !== massKg }
}
