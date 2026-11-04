import type { Dated } from '../calendar'
import type { AnalysisResult } from '../digest/combine'
import { gradeEffort } from '../grade'
import type { AgeProfile, EffortGrade, GapKind } from '../grade'
import { metabolicToFlatSpeed } from '../metabolic'
import { HOUR_S } from '../threshold/constants'
import type { ThresholdEstimate } from '../threshold'
import type { Interval, Sport } from '../types'
import { SPORTS } from '../types'
import type { UnitSystem } from '../units'
import { balanceLead } from './lead'
import type { BalanceLead } from './lead'
import { matchFigure } from './match'
import type { MatchFigure } from './match'

/** A sport's grade at its threshold, or why there is none: it has no estimate yet, or the athlete has not given the year of birth and sex. */
export type StandingGrade =
  | Exclude<EffortGrade, { kind: 'gap' }>
  | { kind: 'gap'; why: GapKind | 'no-threshold' | 'no-profile' }

/**
 * Where the athlete stands, as numbers: every figure the Balance page, its cards, the sport pages, the share card and the import
 * notice state about the two sports' thresholds comes from here, so no two surfaces can work out their own copy.
 */
export interface SportStanding {
  /** Each sport's grade at its threshold, as an hour, at the age on the day of the threshold's strongest effort. */
  grades: Record<Sport, StandingGrade>
  /** The ride threshold as the pace the same hour of running would be (m/s, with the range); the "ride as a run". Null without a ride threshold. */
  rideAsRun: Interval | null
  /** Running's grade lead over cycling's in whole points, with its range and the lean; null unless both are graded. */
  lead: BalanceLead | null
  /** What each sport's threshold would need to be to grade level with the other's; null for the higher sport, an even lead, or no figure. */
  match: Record<Sport, MatchFigure | null>
}

/** What the figures that depend on the athlete's body and display need: today's mass, and the units paces are named in. */
export interface StandingContext {
  massKg: number
  units: UnitSystem
}

/** The estimate of each sport's threshold in a result. */
const ESTIMATE_OF: Record<Sport, (result: AnalysisResult) => ThresholdEstimate | null> = {
  run: (result) => result.runThreshold,
  ride: (result) => result.rideThreshold,
}

/** The flat running speed a sport's threshold stands for, with its range: a run's pace, and a ride's anchored running equivalent. */
const SPEED_OF_THRESHOLD: Record<Sport, (result: AnalysisResult) => Interval | null> = {
  run: (result) => {
    const estimate = result.runThreshold
    if (estimate === null) return null
    return {
      p05: metabolicToFlatSpeed(estimate.low),
      p50: metabolicToFlatSpeed(estimate.value),
      p95: metabolicToFlatSpeed(estimate.high),
    }
  },
  ride: (result) => result.rideThresholdRunSpeed,
}

/** The start (with its day shift) of the activity with this id, or null when it is not among the result's activities. */
function startOf(result: AnalysisResult, activityId: string): Dated | null {
  return result.activities.find((activity) => activity.id === activityId) ?? null
}

function gradeOf(result: AnalysisResult, sport: Sport, profile: AgeProfile | null): StandingGrade {
  const estimate = ESTIMATE_OF[sport](result)
  if (estimate === null) return { kind: 'gap', why: 'no-threshold' }
  if (profile === null) return { kind: 'gap', why: 'no-profile' }
  return gradeEffort(
    sport,
    {
      speed: SPEED_OF_THRESHOLD[sport](result),
      started: startOf(result, estimate.efforts.strongest.activityId),
    },
    HOUR_S,
    profile,
  )
}

/**
 * The athlete's standing: both thresholds graded as an hour (a run by its pace, a ride through the running equivalent anchored at
 * the best riders' hour), the lead between them and its range, the ride as a run, and, given the body mass and units, what the lower
 * sport would need to match the higher. Age is taken on the day of each threshold's strongest effort. Without a profile there are
 * no grades; the ride as a run needs none.
 */
export function sportStanding(
  result: AnalysisResult,
  profile: AgeProfile | null,
  context?: StandingContext,
): SportStanding {
  const grades = Object.fromEntries(
    SPORTS.map((sport) => [sport, gradeOf(result, sport, profile)]),
  ) as Record<Sport, StandingGrade>
  const [first, second] = SPORTS
  const one = grades[first]
  const other = grades[second]
  const lead =
    one.kind === 'graded' && other.kind === 'graded' ? balanceLead(one.grade, other.grade) : null
  const match = Object.fromEntries(SPORTS.map((sport) => [sport, null])) as Record<
    Sport,
    MatchFigure | null
  >
  if (profile !== null && lead !== null && lead.lean !== 'even' && context !== undefined) {
    const higher = lead.lean
    const lower = higher === first ? second : first
    const lowerGrade = grades[lower]
    const higherGrade = grades[higher]
    if (lowerGrade.kind === 'graded' && higherGrade.kind === 'graded') {
      match[lower] = matchFigure({
        higher,
        lower,
        higherGrade: higherGrade.grade.centre.grade,
        athlete: { age: lowerGrade.age, sex: profile.sex, massKg: context.massKg },
        threshold: ESTIMATE_OF[lower](result),
        units: context.units,
      })
    }
  }
  return { grades, rideAsRun: result.rideThresholdRunSpeed, lead, match }
}
