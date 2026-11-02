import type { Dated } from '../calendar'
import type { Interval, Sport } from '../types'
import {
  FIRST_GRADED_AGE,
  LAST_GRADED_AGE,
  ageAt,
  ageGradeForEffort,
  gradeCeiling,
  levelOf,
} from './ageGrade'
import type { Sex } from './ageGrade'

/*
 * The one path from a best effort to an age grade. The cards, the balance and the history all grade through
 * `gradeEffort`, so a number is the same wherever it is drawn. The words for why there is no grade are the page's.
 */

/** The year of birth and sex that every grade needs. */
export interface AgeProfile {
  birthYear: number
  sex: Sex
}

/** The age on the date of an effort, with the sex it is graded for. */
export interface AgeAndSex {
  age: number
  sex: Sex
}

/** An age grade: the fraction and its level. */
export interface Grade {
  grade: number
  level: string
}

/**
 * A sport's age grade at one duration. A run is one activity's estimate and has no range.
 * A ride is estimated through its running equivalent, so it carries the model's range.
 */
export interface SportGrade {
  centre: Grade
  range: { low: Grade; high: Grade } | null
}

/**
 * The age on atMs, from the year of birth. Null outside the ages the standards cover,
 * so an age the standards cannot grade is never used.
 */
export function ageAndSexAt(profile: AgeProfile, at: number | Dated): AgeAndSex | null {
  const age = ageAt(profile.birthYear, at)
  if (age === null || age < FIRST_GRADED_AGE || age > LAST_GRADED_AGE) return null
  return { age, sex: profile.sex }
}

function gradeOf(grade: number | null): Grade | null {
  if (grade === null) return null
  const level = levelOf(grade)
  return level === null ? null : { grade, level }
}

/**
 * The grade of holding a flat running speed for durationS, for an athlete of a given age and sex.
 * Every grade the app shows comes through here. Null when the distance has no standard.
 */
export function gradeAtSpeed(
  speedMs: number,
  durationS: number,
  ageAndSex: AgeAndSex,
): Grade | null {
  return gradeOf(ageGradeForEffort(speedMs, durationS, ageAndSex.age, ageAndSex.sex))
}

/** A ride's grade read from its running-equivalent speeds, and whether it reaches the top of the age tables. */
export interface RideGradeRead {
  /** The grade with every end held at the ceiling, so none is above 100%. */
  grade: SportGrade
  /** The centre is at or above the ceiling: the ride is at the top of the scale. */
  top: boolean
}

/**
 * The one reading of a ride's running equivalent as a grade. A ride has no ceiling of its own, so the running
 * record bounds it (gradeCeiling): an end above the ceiling is held at it, and a centre at or above it is at the top
 * of the scale. With no ceiling (the record's distance at this length is under the shortest standard) any graded
 * equivalent is past it, and the ends above 100% are held at 100%. Null when an end has no grade.
 */
export function rideGradeFromSpeeds(
  runSpeed: Interval,
  durationS: number,
  ageAndSex: AgeAndSex,
): RideGradeRead | null {
  const at = (speedMs: number) => gradeAtSpeed(speedMs, durationS, ageAndSex)
  const low = at(runSpeed.p05)
  const centre = at(runSpeed.p50)
  const high = at(runSpeed.p95)
  if (!(low && centre && high)) return null
  const ceiling = gradeCeiling(durationS, ageAndSex.age, ageAndSex.sex) ?? 1
  const held = (grade: Grade): Grade =>
    grade.grade > ceiling ? (gradeOf(ceiling) ?? grade) : grade
  return {
    grade: { centre: held(centre), range: { low: held(low), high: held(high) } },
    top: centre.grade >= ceiling,
  }
}

/** Why an effort has no grade. */
export type GapKind = 'no-date' | 'age-range' | 'no-standard'

/**
 * A grade for an effort, or why there is none. A ride at or above what the age tables cover is its own outcome:
 * capped at 100%, with no grade of its own, and left out of the comparison with the run.
 */
export type EffortGrade =
  | { kind: 'graded'; age: number; grade: SportGrade }
  | { kind: 'top-of-scale'; age: number }
  | { kind: 'gap'; why: GapKind }

/**
 * A best effort as the grade reads it: the flat running speed that costs the same (a run's pace as recorded, a
 * ride's running equivalent, null when a ride has none) and the day it was set, which the age is taken on.
 */
export interface GradedEffort {
  speed: Interval | null
  started: Dated | null
}

type Grader = (speed: Interval | null, durationS: number, who: AgeAndSex) => EffortGrade

const noStandard: EffortGrade = { kind: 'gap', why: 'no-standard' }

/** How each sport's speed becomes a grade: a run's is its centre alone, a ride's carries its range through its equivalent. */
const GRADER: Record<Sport, Grader> = {
  run: (speed, durationS, who) => {
    const centre = speed === null ? null : gradeAtSpeed(speed.p50, durationS, who)
    return centre === null
      ? noStandard
      : { kind: 'graded', age: who.age, grade: { centre, range: null } }
  },
  ride: (speed, durationS, who) => {
    const ride = speed === null ? null : rideGradeFromSpeeds(speed, durationS, who)
    if (ride === null) return noStandard
    return ride.top
      ? { kind: 'top-of-scale', age: who.age }
      : { kind: 'graded', age: who.age, grade: ride.grade }
  },
}

/**
 * A sport's age grade for the best effort at durationS, taken at the age on the day it was set. Without that day
 * there is no age, and outside the ages the standards cover there is no grade.
 */
export function gradeEffort(
  sport: Sport,
  effort: GradedEffort,
  durationS: number,
  profile: AgeProfile,
): EffortGrade {
  if (effort.started === null) return { kind: 'gap', why: 'no-date' }
  const who = ageAndSexAt(profile, effort.started)
  if (who === null) return { kind: 'gap', why: 'age-range' }
  return GRADER[sport](effort.speed, durationS, who)
}
