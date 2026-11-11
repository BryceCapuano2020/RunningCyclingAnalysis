import type { Dated } from '../calendar'
import type { AnalysisResult } from '../digest/combine'
import { gradeEffort } from '../grade'
import type { AgeProfile, EffortGrade, GapKind } from '../grade'
import { HOUR_S } from '../threshold/constants'
import type { ThresholdEstimate } from '../threshold'
import type { Interval, Sport } from '../types'
import { SPORTS } from '../types'
import type { UnitSystem } from '../units'
import { runThresholdSpeed } from '../digest/equivalents'
import { gradeHalf } from './halfGrade'
import type { HalfForecast } from './halfGrade'
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
  /**
   * Each sport's grade. A run with a forecast half marathon is graded by that half (`gradeHalf`), the figure Balance's run row and
   * the Run page's levels state; without one, and for a ride, by the threshold as an hour at the age on the day of its strongest effort.
   */
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

/**
 * The flat running speed a sport's threshold stands for, with its range: a run's pace (`runThresholdSpeed`, its range at the 5th and
 * 95th percentiles like a ride's, so the lead combines two ranges of one kind), and a ride's anchored running equivalent, which the
 * analysis already holds.
 */
const SPEED_OF_THRESHOLD: Record<Sport, (result: AnalysisResult) => Interval | null> = {
  run: (result) => runThresholdSpeed(result.runThreshold),
  ride: (result) => result.rideThresholdRunSpeed,
}

/** The start (with its day shift) of the activity with this id, or null when it is not among the result's activities. */
function startOf(result: AnalysisResult, activityId: string): Dated | null {
  return result.activities.find((activity) => activity.id === activityId) ?? null
}

/**
 * A sport's threshold graded as an hour at the age on the day of its strongest effort (`started`): the one grading every threshold
 * goes through, a period's here and a year's in `standingOfYears`. `found` is null without a threshold; without a profile there is
 * no age to grade at.
 */
export function gradeThreshold(
  sport: Sport,
  found: { speed: Interval | null; started: Dated | null } | null,
  profile: AgeProfile | null,
): StandingGrade {
  if (found === null) return { kind: 'gap', why: 'no-threshold' }
  if (profile === null) return { kind: 'gap', why: 'no-profile' }
  return gradeEffort(sport, found, HOUR_S, profile)
}

function gradeOf(result: AnalysisResult, sport: Sport, profile: AgeProfile | null): StandingGrade {
  const estimate = ESTIMATE_OF[sport](result)
  return gradeThreshold(
    sport,
    estimate === null
      ? null
      : {
          speed: SPEED_OF_THRESHOLD[sport](result),
          started: startOf(result, estimate.efforts.strongest.activityId),
        },
    profile,
  )
}

/**
 * The athlete's standing: each sport graded (a run by its forecast half marathon, `runHalf`, when there is one, else by its
 * threshold pace as an hour; a ride through the running equivalent anchored at the best riders' hour), the lead between them and its
 * range, the ride as a run, and, given the body mass and units, what the lower sport's threshold would need to be to match the
 * higher's grade. A threshold's age is taken on the day of its strongest effort, a half's on its `atMs`. Without a profile there are
 * no grades; the ride as a run needs none.
 */
export function sportStanding(
  result: AnalysisResult,
  profile: AgeProfile | null,
  context?: StandingContext,
  runHalf: HalfForecast | null = null,
): SportStanding {
  const grades = Object.fromEntries(
    SPORTS.map((sport) => [
      sport,
      sport === 'run' && runHalf !== null
        ? profile === null
          ? { kind: 'gap', why: 'no-profile' }
          : gradeHalf(runHalf, profile)
        : gradeOf(result, sport, profile),
    ]),
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
