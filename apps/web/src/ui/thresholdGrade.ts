import { gradeEffort } from '@rca/core/grade'
import type { AgeProfile } from '@rca/core/grade'
import { metabolicToFlatSpeed } from '@rca/core/metabolic'
import type { AnalysisResult } from '@rca/core/pipeline'
import { HOUR_S } from '@rca/core/threshold'
import type { Interval, Sport } from '@rca/core/types'
import { gapOutcome, outcomeOf, startOf } from './grades'
import type { GradeOutcome, HeadlineGrades } from './grades'
import { thresholdEstimate } from './thresholdEstimate'
import { thresholdNeedsLine } from './thresholdNeeds'

/**
 * The flat running speed a sport's threshold costs, for the age grade to read: a run's pace as the threshold gives it, with no
 * range of its own (a run is graded as recorded), and a ride's running equivalent, which carries the estimate's low and high and the
 * equivalence's own range (`AnalysisResult.rideThresholdRunSpeed`). A sport added to `Sport` says here how its threshold is a speed.
 */
const SPEED_OF_THRESHOLD: Record<Sport, (result: AnalysisResult) => Interval | null> = {
  run: (result) => {
    const estimate = thresholdEstimate(result, 'run')
    if (estimate === null) return null
    const speed = metabolicToFlatSpeed(estimate.value)
    return { p05: speed, p50: speed, p95: speed }
  },
  ride: (result) => result.rideThresholdRunSpeed,
}

/**
 * A sport's age grade at its threshold: the threshold graded as the effort of an hour it stands for, by the standards a best
 * effort is graded by (a run's pace through `gradeAtSpeed`, a ride through its running equivalent), at the age on the day of the
 * threshold's strongest effort. The one number a sport has on the current-period surfaces. A sport with no threshold has the
 * threshold's own words for what it needs; a ride at the top of the age tables is its own outcome.
 */
export function thresholdGrade(
  result: AnalysisResult,
  sport: Sport,
  profile: AgeProfile,
): GradeOutcome {
  const estimate = thresholdEstimate(result, sport)
  if (estimate === null) return gapOutcome(thresholdNeedsLine(result, sport))
  const effort = {
    speed: SPEED_OF_THRESHOLD[sport](result),
    started: startOf(result, estimate.efforts.strongest.activityId),
  }
  return outcomeOf(gradeEffort(sport, effort, HOUR_S, profile))
}

/** Both sports' grades at their thresholds, each at its own date. */
export function thresholdGrades(result: AnalysisResult, profile: AgeProfile): HeadlineGrades {
  return {
    run: thresholdGrade(result, 'run', profile),
    ride: thresholdGrade(result, 'ride', profile),
  }
}
