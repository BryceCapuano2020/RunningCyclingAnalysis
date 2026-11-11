import { LIFTS } from '@rca/core/lift'
import type { GradedLift, LiftGrade, LiftResults } from '@rca/core/lift'
import { formatMass } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'

/** A figure as its number and its unit, whole. */
export interface Parts {
  number: string
  unit: string
}

/** One of the big three on the Lift page's lead: its projected one-rep max and its age grade, or nothing logged yet. */
export interface BigThreeLift {
  lift: GradedLift
  label: string
  /** The projected one-rep max; null while the lift has no estimate. */
  max: Parts | null
  /** The age grade, or why there is none; null while the lift has no estimate. */
  grade: LiftGrade | null
}

/** The Lift page's lead: the big three side by side, and their total once all three have an estimate. */
export interface BigThreeLeadModel {
  lifts: BigThreeLift[]
  total: Parts | null
}

/** The big three as the lead names them. */
export const BIG_THREE_LABEL: Record<GradedLift, string> = {
  squat: 'Squat',
  bench: 'Bench',
  deadlift: 'Deadlift',
}

function parts(kg: number, units: UnitSystem): Parts {
  const text = formatMass(kg, units)
  const at = text.lastIndexOf(' ')
  return { number: text.slice(0, at), unit: text.slice(at + 1) }
}

/**
 * The big three as the Lift page leads with them, from the lift results (`liftResultsOf`: the heaviest estimate of each lift, the
 * one Balance's row and the hero's lift corner use, and each part's grade). Null while none of the three has an estimate: the page
 * then leads with the lift trained last.
 */
export function bigThreeLeadOf(results: LiftResults, units: UnitSystem): BigThreeLeadModel | null {
  const { bigThree: big, bigThreeGrades: grades } = results
  if (big.kind === 'none') return null
  return {
    lifts: LIFTS.map((lift) => {
      const at = big.parts.findIndex((each) => each.lift === lift)
      const part = big.parts[at]
      return {
        lift,
        label: BIG_THREE_LABEL[lift],
        max: part === undefined ? null : parts(part.kg, units),
        grade: part === undefined ? null : (grades[at] ?? null),
      }
    }),
    total: big.kind === 'total' ? parts(big.kg, units) : null,
  }
}
