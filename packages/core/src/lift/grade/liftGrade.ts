/**
 * A lift's age grade: the e1RM as a share of the world-class lift for the athlete's age, sex and mass, with a range, and the
 * one lift figure for the hero (docs/design/lift-grade.md, sections 5 and 9). Pure; the age is read through the calendar.
 */
import type { AgeProfile, Grade, SportGrade } from '../../grade/effortGrade'
import { levelOf } from '../../grade/ageGrade'
import { DEADLIFT_EXTRA_HIGH, MASS_SD_BASE } from '../constants'
import type { LiftEstimate } from '../estimate'
import { liftAgeOn, liftStandard } from './liftStandard'
import { BIRTH_YEAR_SD, GRADE_CEILING, Z_HIGH, Z_LOW, Z_STANDARD, standardSd } from './standard'
import type { GradedLift } from './standard'
import { heaviestPerLift } from './heaviest'

export type LiftGradeGap = 'no-profile' | 'no-mass' | 'no-graded-lift' | 'out-of-range'

/** A graded lift figure: the fraction with its range, and whether it is held at the top of the scale. */
export type LiftGrade =
  | { kind: 'graded'; age: number; grade: SportGrade; top: boolean }
  | { kind: 'gap'; why: LiftGradeGap }

/** The hero's lift figure: a share of the total, with the lifts it holds. */
export type LiftCornerGrade =
  | { kind: 'graded'; age: number; grade: SportGrade; top: boolean; lifts: GradedLift[] }
  | { kind: 'gap'; why: LiftGradeGap }

export interface GradedEstimate {
  lift: GradedLift
  estimate: LiftEstimate
}

/** One lift's estimate and range in kg, and its standard. */
interface Measured {
  age: number
  standardKg: number
  point: number
  low: number
  high: number
}

/** d ln S / d ln mass and d ln S / d age (per year) by a centred difference; each is nil where S is held (the clamps). */
function slopes(
  lift: GradedLift,
  sex: AgeProfile['sex'],
  age: number,
  massKg: number,
): { mass: number; age: number } {
  const dm = 0.01
  const da = 0.5
  const lnS = (a: number, m: number) => Math.log(liftStandard(lift, sex, a, m).kg)
  return {
    mass: (lnS(age, massKg * Math.exp(dm)) - lnS(age, massKg * Math.exp(-dm))) / (2 * dm),
    age: (lnS(age + da, massKg) - lnS(age - da, massKg)) / (2 * da),
  }
}

/**
 * The estimate's own error (log units) with the standard's error, the mass error and the age's spread added in
 * quadrature (section 5): `sd'` for the range, and `sdT` for the floor term.
 */
function measure(
  { lift, estimate }: GradedEstimate,
  profile: AgeProfile,
  massKg: number,
  massSd: number,
): Measured | 'out-of-range' {
  const age = liftAgeOn(profile.birthYear, estimate.date)
  const standard = liftStandard(lift, profile.sex, age, massKg)
  if (!Number.isFinite(age) || standard.outOfRange) return 'out-of-range'
  const slope = slopes(lift, profile.sex, age, massKg)
  const sdT = Math.hypot(
    standardSd(profile.sex, age, massKg),
    slope.mass * massSd,
    slope.age * BIRTH_YEAR_SD,
  )
  const spread = Math.hypot(estimate.sd, sdT)
  const point = estimate.point
  const wide = lift === 'deadlift' ? 1 + DEADLIFT_EXTRA_HIGH : 1
  const lowest = estimate.floor.loadKg * Math.exp(-Z_STANDARD * sdT)
  return {
    age,
    standardKg: standard.kg,
    point,
    low: Math.min(point, Math.max(point * Math.exp(-Z_LOW * spread), lowest)),
    high: Math.max(point * Math.exp(Z_HIGH * spread) * wide, point),
  }
}

const gradeAt = (fraction: number): Grade => ({ grade: fraction, level: levelOf(fraction) ?? '' })

/** The shown grade of kg sums over a standard: capped at 1, and over the ceiling it is not a grade. */
function shown(
  m: { age: number; point: number; low: number; high: number },
  standardKg: number,
): { age: number; grade: SportGrade; top: boolean } | null {
  const centre = m.point / standardKg
  if (!(centre <= GRADE_CEILING)) return null
  const held = (kg: number): Grade => gradeAt(Math.min(1, kg / standardKg))
  return {
    age: m.age,
    grade: { centre: held(m.point), range: { low: held(m.low), high: held(m.high) } },
    top: centre >= 1,
  }
}

function gapOf(profile: AgeProfile | null, massKg: number): LiftGradeGap | null {
  if (profile === null) return 'no-profile'
  return Number.isFinite(massKg) && massKg > 0 ? null : 'no-mass'
}

/**
 * One lift's age grade at the date of its estimate. The range is the estimate's own error and the standard's, in quadrature,
 * on the log scale, never under the floor's share. A centre over 110% is not graded; one at 100% or more is held at 100% and
 * flagged `top`. `massKg` is the body mass on the estimate's date and `massSd` its error (log units, `massSdFor`).
 */
export function liftGrade(
  graded: GradedEstimate | null,
  profile: AgeProfile | null,
  massKg: number,
  massSd: number = MASS_SD_BASE,
): LiftGrade {
  const gap = gapOf(profile, massKg)
  if (gap !== null) return { kind: 'gap', why: gap }
  if (graded === null) return { kind: 'gap', why: 'no-graded-lift' }
  const m = measure(graded, profile as AgeProfile, massKg, massSd)
  if (m === 'out-of-range') return { kind: 'gap', why: 'out-of-range' }
  const out = shown(m, m.standardKg)
  return out === null ? { kind: 'gap', why: 'out-of-range' } : { kind: 'graded', ...out }
}

/**
 * The hero's lift figure: the share of the total, the sum of the e1RMs over the sum of the standards across the graded lifts, with
 * the sums of the lows and highs the same way. Each lift counts once, at its heaviest estimate (a conventional and a sumo deadlift
 * are one deadlift), as in the Big three row. A lift with no grade of its own is left out; with none left, the gap of the first.
 * The age is the one at the newest estimate.
 */
export function liftCornerGrade(
  lifts: readonly GradedEstimate[],
  profile: AgeProfile | null,
  massKg: number,
  massSd: number = MASS_SD_BASE,
): LiftCornerGrade {
  const gap = gapOf(profile, massKg)
  if (gap !== null) return { kind: 'gap', why: gap }
  const held: GradedLift[] = []
  const sum = { age: 0, point: 0, low: 0, high: 0, standardKg: 0 }
  let first: LiftGradeGap = 'no-graded-lift'
  for (const l of heaviestPerLift(lifts)) {
    const m = measure(l, profile as AgeProfile, massKg, massSd)
    if (m === 'out-of-range' || shown(m, m.standardKg) === null) {
      if (first === 'no-graded-lift') first = 'out-of-range'
      continue
    }
    held.push(l.lift)
    sum.age = Math.max(sum.age, m.age)
    sum.point += m.point
    sum.low += m.low
    sum.high += m.high
    sum.standardKg += m.standardKg
  }
  if (held.length === 0) return { kind: 'gap', why: first }
  const out = shown(sum, sum.standardKg)
  return out === null
    ? { kind: 'gap', why: 'out-of-range' }
    : { kind: 'graded', ...out, lifts: held }
}
