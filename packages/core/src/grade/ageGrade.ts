import { ROAD_DISTANCES_M, ROAD_STANDARDS_FEMALE, ROAD_STANDARDS_MALE } from './roadStandards'

export type Sex = 'female' | 'male'

/** The ages the road standards cover, inclusive. Outside them there is no grade. */
export const FIRST_GRADED_AGE = 5
export const LAST_GRADED_AGE = 100
const TABLES: Record<Sex, number[][]> = {
  female: ROAD_STANDARDS_FEMALE,
  male: ROAD_STANDARDS_MALE,
}
const FIRST_DISTANCE_M = ROAD_DISTANCES_M[0]!
const LAST_DISTANCE_M = ROAD_DISTANCES_M[ROAD_DISTANCES_M.length - 1]!

/**
 * Age-standard time in seconds for a road race of distanceM by an athlete of the given integer age
 * (5 to 100), or null when no standard applies. A table distance returns its published whole
 * seconds. Between two table distances the time is interpolated log-linearly, so log time is
 * linear in log distance. Distances from 1 mile to 200 km have a standard; others return null.
 * An unknown sex, a non-integer age or a non-finite distance also returns null.
 *
 * Known source anomalies are kept exactly as published: the male age-5 distance inversion (7 Mile
 * is slower than 12 km) and the female age-100 10 km cell, 12172 s. See roadStandards.ts.
 */
export function ageStandardSeconds(distanceM: number, age: number, sex: Sex): number | null {
  const table: number[][] | undefined = Object.hasOwn(TABLES, sex) ? TABLES[sex] : undefined
  if (
    table === undefined ||
    !Number.isInteger(age) ||
    age < FIRST_GRADED_AGE ||
    age > LAST_GRADED_AGE
  ) {
    return null
  }
  if (!Number.isFinite(distanceM) || distanceM < FIRST_DISTANCE_M || distanceM > LAST_DISTANCE_M) {
    return null
  }
  const row = table[age - FIRST_GRADED_AGE]!
  let hi = 0
  while (ROAD_DISTANCES_M[hi]! < distanceM) hi++
  if (ROAD_DISTANCES_M[hi] === distanceM) return row[hi]!
  const lo = hi - 1
  const dLo = ROAD_DISTANCES_M[lo]!
  const dHi = ROAD_DISTANCES_M[hi]!
  const t = Math.log(distanceM / dLo) / Math.log(dHi / dLo)
  return Math.exp(Math.log(row[lo]!) * (1 - t) + Math.log(row[hi]!) * t)
}

/**
 * Age grade as a fraction: the age-standard time for distanceM divided by timeS, so 0.6767 is
 * 67.67%. Null when no standard applies, when timeS is not a finite positive number, or when the
 * quotient is not finite.
 */
export function ageGrade(distanceM: number, timeS: number, age: number, sex: Sex): number | null {
  if (!Number.isFinite(timeS) || timeS <= 0) return null
  const standard = ageStandardSeconds(distanceM, age, sex)
  if (standard === null) return null
  const grade = standard / timeS
  return Number.isFinite(grade) ? grade : null
}

/**
 * Age grade for holding speedMs for durationS: the grade of covering speedMs × durationS metres
 * in durationS seconds. Null for a non-finite speed or duration, or when the distance has no
 * standard, for example at zero speed.
 */
export function ageGradeForEffort(
  speedMs: number,
  durationS: number,
  age: number,
  sex: Sex,
): number | null {
  if (!Number.isFinite(speedMs) || !Number.isFinite(durationS)) return null
  return ageGrade(speedMs * durationS, durationS, age, sex)
}

/**
 * Age in calendar years on dateMs, in the local time zone, from the year of birth alone. Only the
 * birth year is known, so until the athlete's birthday this can be one year more than their age.
 * Null when birthYear is not an integer, dateMs is not a finite time, or the age falls outside 0 to
 * 120.
 */
export function ageAt(birthYear: number, dateMs: number): number | null {
  if (!Number.isInteger(birthYear) || !Number.isFinite(dateMs)) return null
  const age = new Date(dateMs).getFullYear() - birthYear
  return age >= 0 && age <= 120 ? age : null
}

export interface GradeLevel {
  /** Smallest grade in the band, inclusive. */
  readonly min: number
  readonly label: string
}

/** WMA-style level bands for an age grade, highest first. The names are the UI's level names. */
export const GRADE_LEVELS: readonly GradeLevel[] = [
  { min: 0.9, label: 'World' },
  { min: 0.8, label: 'National' },
  { min: 0.7, label: 'Regional' },
  { min: 0.6, label: 'Local' },
  { min: 0, label: 'Recreational' },
]

/**
 * The band label for a grade fraction, or null when the grade is not a finite non-negative
 * number. NaN, Infinity and negative numbers all give null, and a grade of exactly 0 is
 * Recreational. Pass the unrounded grade, so the label agrees with gradePercent.
 */
export function levelOf(grade: number): string | null {
  if (!Number.isFinite(grade) || grade < 0) return null
  return GRADE_LEVELS.find((band) => grade >= band.min)?.label ?? null
}

/**
 * The grade as a percentage to one decimal place, rounded down: 0.8999 gives 89.9 and never 90.
 * The UI shows this value, with levelOf applied to the unrounded grade, so the number and the
 * band always agree. Null when the grade is not a finite non-negative number, as for levelOf.
 */
export function gradePercent(grade: number): number | null {
  if (!Number.isFinite(grade) || grade < 0) return null
  return Math.floor(grade * 1000) / 10
}

/** The published standards behind the grades, for citation in the UI. */
export const ROAD_STANDARDS_SOURCE = {
  name: 'USATF road age standards (2025)',
  /** The name for a short citation, such as a caption: "on the USATF road standards". */
  shortName: 'USATF road standards',
  authors: 'Alan Jones and Tom Bernhard',
  url: 'https://github.com/AlanLyttonJones/Age-Grade-Tables',
  licence: 'CC0 1.0',
}
