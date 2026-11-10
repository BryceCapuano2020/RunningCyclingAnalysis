/**
 * The lift age grade's standard: every number in one place (docs/design/lift-grade.md, sections 4 and 5). Fitted to
 * public OpenPowerlifting results, raw lifts. The 99.9th percentile envelope is divided by `WORLD_SHARE`, so it reads 90 percent.
 */
import type { Sex } from '../../grade/ageGrade'

export const LIFT_GRADE_STANDARD = 'openpowerlifting-2026-11-07-raw-tau999'

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
    male: { a: 5.7188, b: 0.636, c: -0.0933, k: 3.1886, P: 34.1798, d1: 0.00474, d2: 0.00012 },
    female: { a: 5.3271, b: 0.6121, c: -0.1838, k: 3.0996, P: 33.0, d1: 0.00616, d2: 0 },
  },
  bench: {
    male: { a: 5.4299, b: 0.4718, c: 0.1524, k: 4.1741, P: 40.5166, d1: 0.00636, d2: 0.00014 },
    female: { a: 4.94, b: 0.4435, c: -0.2073, k: 3.6641, P: 44.5418, d1: 0.0103, d2: 0 },
  },
  deadlift: {
    male: { a: 5.8429, b: 0.5004, c: -0.2773, k: 3.0633, P: 33.0, d1: 0.0051, d2: 6e-5 },
    female: { a: 5.4557, b: 0.4995, c: -0.4074, k: 3.2513, P: 39.5944, d1: 0.0055, d2: 0 },
  },
}

/** The standard's own error in log units for an athlete of this age and mass: the fit's bootstrap error (section 7). */
export function standardSd(_age: number, _massKg: number): number {
  return 0.02
}

/** z for the 5th and 95th percentile ends: the e1RM's own 1.1 and 1.5 widened by 1.645 / 1.2816 (section 5). */
export const Z_LOW = 1.412
export const Z_HIGH = 1.925
/** The z of the 90 percent range on the standard's own error. */
export const Z_STANDARD = 1.645
/** No grade is shown above this: beyond all but a few lifters in 50,000. */
export const GRADE_CEILING = 1.1

/** Where the lift standards come from, for a citation beside a lift grade (docs/design/lift-grade.md, section 2). */
export const LIFT_STANDARDS_SOURCE = {
  name: 'OpenPowerlifting meet results',
  /** The name for a short citation: "Lifting on judged meet lifts from OpenPowerlifting". */
  shortName: 'judged meet lifts, OpenPowerlifting',
  url: 'https://www.openpowerlifting.org',
  attribution:
    'Lift standards are fitted to results from the OpenPowerlifting project, https://www.openpowerlifting.org. You may download a copy of the data at https://data.openpowerlifting.org.',
} as const
