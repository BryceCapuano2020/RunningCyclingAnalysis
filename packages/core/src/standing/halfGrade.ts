import { HALF_MARATHON_M } from '../constants'
import { ageAndSexAt, ageGrade, levelOf } from '../grade'
import type { AgeProfile, Grade } from '../grade'
import type { StandingGrade } from './standing'

/**
 * A predicted half marathon as the run's grade reads it: the predicted time and its range, in seconds, and the day the age is
 * taken on (the end of the period the prediction is of). The Run page's levels table states its bands at the same age.
 */
export interface HalfForecast {
  seconds: number
  /** The fast end of the range. */
  low: number
  /** The slow end of the range. */
  high: number
  atMs: number
}

/**
 * The run's grade when there is a forecast half marathon: the half's time graded on the road standard for the distance, the grade
 * `runLevelTimes` inverts, so the level it names is the row of the Run page's table its time falls in. The range's slow end is the
 * grade's low and its fast end the high. Without a graded age there is no grade.
 */
export function gradeHalf(half: HalfForecast, profile: AgeProfile): StandingGrade {
  const who = ageAndSexAt(profile, half.atMs)
  if (who === null) return { kind: 'gap', why: 'age-range' }
  const at = (seconds: number): Grade | null => {
    const grade = ageGrade(HALF_MARATHON_M, seconds, who.age, who.sex)
    const level = grade === null ? null : levelOf(grade)
    return grade === null || level === null ? null : { grade, level }
  }
  const centre = at(half.seconds)
  if (centre === null) return { kind: 'gap', why: 'no-standard' }
  const ranged = half.low < half.seconds || half.high > half.seconds
  const low = ranged ? at(half.high) : null
  const high = ranged ? at(half.low) : null
  return {
    kind: 'graded',
    age: who.age,
    grade: { centre, range: low !== null && high !== null ? { low, high } : null },
  }
}
