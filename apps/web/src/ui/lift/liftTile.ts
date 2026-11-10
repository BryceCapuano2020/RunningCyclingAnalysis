import { bigThreeTotal, gradedLiftOf, liftGrade } from '@rca/core/lift'
import type { GradeBody, GradedEstimate, GradedLift, LiftSummary } from '@rca/core/lift'
import type { AgeProfile } from '@rca/core/grade'
import { formatMass } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'
import type { Property } from '../components/property'
import { formatGrade } from '../gradeFormat'

/** The big three as the row names them. */
const LIFT_LABEL: Record<GradedLift, string> = {
  squat: 'Squat',
  bench: 'Bench',
  deadlift: 'Deadlift',
}

/** The Balance row for lifting: a title, the big number (none while nothing is estimated) and one detail row per lift. */
export interface LiftTileModel {
  heading: string
  figure: { number: string; unit: string } | null
  rows: Property[]
}

const unbroken = (text: string) => text.replaceAll(' ', ' ')

/** An estimate as its number and its unit, whole: a projected one-rep max is not known to a tenth of a pound. */
function loadParts(kg: number, units: UnitSystem): { number: string; unit: string } {
  const text = formatMass(kg, units)
  const at = text.lastIndexOf(' ')
  return { number: text.slice(0, at), unit: text.slice(at + 1) }
}

/**
 * The lifting row. The big number is the total of the three projected one-rep maxes when each has one (core's `bigThreeTotal`),
 * else the heaviest with its lift named in the title; the details give each lift as "40% · 298 lb", its age grade (core's
 * `liftGrade`, the function the hero's lift corner sums) and its one-rep max, or the one-rep max alone for a lift with no grade.
 */
export function liftTileOf(
  lifts: readonly LiftSummary[],
  profile: AgeProfile | null,
  body: GradeBody,
  units: UnitSystem,
): LiftTileModel {
  const estimates = lifts.flatMap((summary): GradedEstimate[] => {
    const lift = gradedLiftOf(summary.exercise, summary.equipment)
    return lift === null || summary.estimate === null ? [] : [{ lift, estimate: summary.estimate }]
  })
  const big = bigThreeTotal(estimates)
  const rows = big.parts.map((part) => {
    const grade = liftGrade({ lift: part.lift, estimate: part.estimate }, profile, body)
    const load = unbroken(formatMass(part.kg, units))
    return {
      label: LIFT_LABEL[part.lift],
      value: grade.kind === 'graded' ? `${formatGrade(grade.grade.centre.grade)} · ${load}` : load,
    }
  })
  if (big.kind === 'none') return { heading: 'Big three total', figure: null, rows }
  return {
    heading: big.kind === 'total' ? 'Big three total' : `${LIFT_LABEL[big.lift]}, projected 1RM`,
    figure: loadParts(big.kg, units),
    rows,
  }
}
