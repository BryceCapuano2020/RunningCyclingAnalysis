/**
 * The lift age grade's standard: every number in one place (docs/design/lift-grade.md, sections 4 and 5). Fitted to
 * public OpenPowerlifting results, raw lifts. The 99.9th percentile envelope is divided by `WORLD_SHARE`, so it reads 90 percent.
 */
import type { Sex } from '../../grade/ageGrade'

export const LIFT_GRADE_STANDARD = 1

export const LIFTS = ['squat', 'bench', 'deadlift'] as const
export type GradedLift = (typeof LIFTS)[number]

/** The fitted curve of one lift and sex: ln S = a + b x + c x^2 + junior rise - masters decline (section 4). */
export interface LiftCurve {
  a: number
  b: number
  c: number
  k: number
  P: number
  d1: number
  d2: number
}

export const WORLD_SHARE = 0.9
/** The age the junior rise starts from, years. */
export const JUNIOR_START_AGE = 10

export const REF_MASS_KG: Record<Sex, number> = { male: 80.0, female: 65.0 }
/** The masses the standard is fitted for, kg. Outside, there is no grade. */
export const MASS_RANGE_KG: Record<Sex, readonly [number, number]> = {
  male: [55.0, 150.0],
  female: [45.0, 130.0],
}
/** The ages the standard is fitted for, years. */
export const AGE_RANGE: readonly [number, number] = [14, 80]

export const CURVES: Record<GradedLift, Record<Sex, LiftCurve>> = {
  squat: {
    male: { a: 5.7231, b: 0.6114, c: -0.2038, k: 3.0097, P: 34.6018, d1: 0.00626, d2: 0.0001 },
    female: { a: 5.3264, b: 0.5747, c: -0.1185, k: 2.9397, P: 30.5579, d1: 0.00681, d2: 7e-5 },
  },
  bench: {
    male: { a: 5.3366, b: 0.5927, c: -0.2856, k: 3.3554, P: 35.9999, d1: 0.00483, d2: 0.00014 },
    female: { a: 4.8797, b: 0.514, c: -0.3195, k: 3.5451, P: 26.3489, d1: 0.0042, d2: 0.00011 },
  },
  deadlift: {
    male: { a: 5.859, b: 0.4248, c: -0.3196, k: 3.1212, P: 30.2986, d1: 0.00485, d2: 8e-5 },
    female: { a: 5.4586, b: 0.4377, c: -0.2599, k: 3.1927, P: 34.2422, d1: 0.00751, d2: 0 },
  },
}

/**
 * The standard's own error, from bootstrap refits (section 5): sdS^2 = s0^2 + (sa u)^2 + (sm x)^2, with
 * u = (age - 30) / 30 above 30 and (30 - age) / 10 below, x = ln(mass / ref).
 */
export const SD_STANDARD: Record<Sex, { s0: number; sa: number; sm: number }> = {
  male: { s0: 0.015, sa: 0.0106, sm: 0.0298 },
  female: { s0: 0.015, sa: 0.0181, sm: 0.0366 },
}

export function standardSd(sex: Sex, age: number, massKg: number): number {
  const { s0, sa, sm } = SD_STANDARD[sex]
  const u = age > 30 ? (age - 30) / 30 : (30 - age) / 10
  const x = Math.log(massKg / REF_MASS_KG[sex])
  return Math.hypot(s0, sa * u, sm * x)
}

/** z of the grade range's ends on the combined error (section 5, retuned on the e1RM simulation). */
export const Z_LOW = 1
export const Z_HIGH = 2.5
/** The z of the 90 percent range on the standard's own error, for the floor term. */
export const Z_STANDARD = 1.645
/** The age spread of a birth year alone: a uniform year, years. */
export const BIRTH_YEAR_SD = 0.289
/** Shown grades stop at 100 percent ("top of scale"); none is shown above this. */
export const GRADE_CEILING = 1.1

/** Where the lift standards come from, for a citation beside a lift grade (docs/design/lift-grade.md, section 2). */
export const LIFT_STANDARDS_SOURCE = {
  name: 'OpenPowerlifting meet results',
  /** The name for a short citation: "Lifting on judged meet lifts from OpenPowerlifting". */
  shortName: 'judged meet lifts, OpenPowerlifting',
  /** The name on a share card's sources line, beside the road standards: "Graded on USATF road standards and OpenPowerlifting." */
  cardName: 'OpenPowerlifting',
  url: 'https://www.openpowerlifting.org',
  attribution:
    'Lift standards are fitted to results from the OpenPowerlifting project, https://www.openpowerlifting.org. You may download a copy of the data at https://data.openpowerlifting.org.',
} as const
