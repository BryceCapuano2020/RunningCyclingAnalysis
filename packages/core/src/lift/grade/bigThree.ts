/**
 * The big three's projected one-rep maxes as one figure for the Balance row: the total when back squat, bench press and
 * deadlift each have an estimate, else the heaviest one that has. Pure; the web formats it. The grade is `liftGrade`'s.
 */
import { heaviestPerLift } from './heaviest'
import type { GradedEstimate } from './liftGrade'
import { LIFTS } from './standard'
import type { GradedLift } from './standard'

/** One lift's projected one-rep max, kg. */
export interface BigThreePart {
  lift: GradedLift
  kg: number
  estimate: GradedEstimate['estimate']
}

export type BigThree =
  /** All three have an estimate: their sum. */
  | { kind: 'total'; kg: number; parts: BigThreePart[] }
  /** One or two do: the heaviest, with every part that exists. */
  | { kind: 'best'; lift: GradedLift; kg: number; parts: BigThreePart[] }
  | { kind: 'none'; parts: [] }

/**
 * The total and its parts, in the order squat, bench, deadlift. Where a lift has more than one estimate (a conventional and a sumo
 * deadlift) its heaviest stands, the same one the row grades.
 */
export function bigThreeTotal(lifts: readonly GradedEstimate[]): BigThree {
  const parts = heaviestPerLift(lifts).map((entry): BigThreePart => ({
    lift: entry.lift,
    kg: entry.estimate.point,
    estimate: entry.estimate,
  }))
  if (parts.length === 0) return { kind: 'none', parts: [] }
  if (parts.length === LIFTS.length) {
    return { kind: 'total', kg: parts.reduce((sum, part) => sum + part.kg, 0), parts }
  }
  const heaviest = parts.reduce((best, part) => (part.kg > best.kg ? part : best))
  return { kind: 'best', lift: heaviest.lift, kg: heaviest.kg, parts }
}
