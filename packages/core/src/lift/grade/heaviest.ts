import type { GradedEstimate } from './liftGrade'
import { LIFTS } from './standard'

/**
 * One estimate per graded lift, the heaviest, in the order squat, bench, deadlift. A conventional and a sumo deadlift both grade as
 * the deadlift, so an athlete with both has two entries: the corner and the Big three row each keep only the heavier.
 */
export function heaviestPerLift(lifts: readonly GradedEstimate[]): GradedEstimate[] {
  const held = new Map<GradedEstimate['lift'], GradedEstimate>()
  for (const entry of lifts) {
    const had = held.get(entry.lift)
    if (had === undefined || entry.estimate.point > had.estimate.point) held.set(entry.lift, entry)
  }
  return LIFTS.flatMap((lift) => {
    const entry = held.get(lift)
    return entry === undefined ? [] : [entry]
  })
}
