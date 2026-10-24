import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { TrendPoint } from '@rca/core/digest'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import type { AgeProfile, Grade } from '../grades'
import { athleteOf, gradeAtSpeed } from '../grades'

/**
 * One week of a shared trend: each sport's value that week, or null where it has none. In a grade
 * trend the values are grade fractions, and a ride also has the grade at the low and high ends of
 * its model range. In an energy trend they are metabolic W/kg, with no range.
 */
export interface SharedWeek {
  endMs: number
  run: number | null
  ride: number | null
  rideLow: number | null
  rideHigh: number | null
  runCount: number
  rideCount: number
}

/** A week's grades for the ride: the centre, and the ends of its model range. */
interface RideGrades {
  centre: number
  low: number
  high: number
}

/**
 * The grade at a speed, at the athlete's age on the day of the effort that set it. The age comes
 * from the effort's date, as the cards take it, so a week is graded by its best effort, not its
 * Sunday. Null without an age the standards cover.
 */
function gradeAt(speedMs: number, profile: AgeProfile, atMs: number): Grade | null {
  const athlete = athleteOf(profile, atMs)
  return athlete === null ? null : gradeAtSpeed(speedMs, HEADLINE_DURATION_S, athlete)
}

function runGradeOf(point: TrendPoint, profile: AgeProfile): number | null {
  if (point.runWkg === null || point.runAtMs === null) return null
  return gradeAt(metabolicToFlatSpeed(point.runWkg), profile, point.runAtMs)?.grade ?? null
}

/**
 * A ride's grades through its running equivalent, which is the same speed the card takes: the
 * centre at the median, and the range from the 5th to the 95th percentile. Null when any end has
 * no grade, as the card requires.
 */
function rideGradesOf(point: TrendPoint, profile: AgeProfile): RideGrades | null {
  const { rideRunSpeed: speed, rideAtMs: atMs } = point
  if (speed === null || atMs === null) return null
  const low = gradeAt(speed.p05, profile, atMs)
  const centre = gradeAt(speed.p50, profile, atMs)
  const high = gradeAt(speed.p95, profile, atMs)
  if (low === null || centre === null || high === null) return null
  return { centre: centre.grade, low: low.grade, high: high.grade }
}

/**
 * Each week's age grade for each sport at the headline effort, graded by the activity that set the
 * week's value. A run is graded as recorded. A ride is graded through its running equivalent, as
 * the cards grade it. A sport with no value, or an age with no standard, has no grade that week.
 */
export function gradeWeeks(points: readonly TrendPoint[], profile: AgeProfile): SharedWeek[] {
  return points.map((point) => {
    const ride = rideGradesOf(point, profile)
    return {
      endMs: point.endMs,
      run: runGradeOf(point, profile),
      ride: ride?.centre ?? null,
      rideLow: ride?.low ?? null,
      rideHigh: ride?.high ?? null,
      runCount: point.runCount,
      rideCount: point.rideCount,
    }
  })
}

/** Each week's energy rate for each sport, in metabolic W/kg, as the trend gives it. */
export function energyWeeks(points: readonly TrendPoint[]): SharedWeek[] {
  return points.map((point) => ({
    endMs: point.endMs,
    run: point.runWkg,
    ride: point.rideWkg,
    rideLow: null,
    rideHigh: null,
    runCount: point.runCount,
    rideCount: point.rideCount,
  }))
}
