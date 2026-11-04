import type { AnalysisResult } from '@rca/core/pipeline'
import type { SportStanding, StandingGrade } from '@rca/core/standing'
import type { Sport } from '@rca/core/types'
import { THRESHOLD_GAP_TEXT, gapOutcome, outcomeOf } from './grades'
import type { AgeProfile, GradeOutcome, HeadlineGrades } from './grades'
import { standingOf } from './standing'
import { thresholdNeedsLine } from './thresholdNeeds'

/**
 * A grade of the standing as the page holds it: the words for why there is none. A sport with no threshold has the threshold's own
 * words for what it needs; a ride at the top of the age tables is its own outcome. The numbers are all core's.
 */
function outcomeOfStanding(
  grade: StandingGrade,
  result: AnalysisResult,
  sport: Sport,
): GradeOutcome {
  if (grade.kind !== 'gap') return grade
  if (grade.why === 'no-threshold') return gapOutcome(thresholdNeedsLine(result, sport))
  if (grade.why === 'no-profile') return gapOutcome('')
  return outcomeOf({ kind: 'gap', why: grade.why }, THRESHOLD_GAP_TEXT)
}

/** Both sports' grades at their thresholds, from a standing, each at its own date. */
export function gradesOfStanding(result: AnalysisResult, standing: SportStanding): HeadlineGrades {
  return {
    run: outcomeOfStanding(standing.grades.run, result, 'run'),
    ride: outcomeOfStanding(standing.grades.ride, result, 'ride'),
  }
}

/** A sport's age grade at its threshold, the one number a sport has on the current-period surfaces (`sportStanding`). */
export function thresholdGrade(
  result: AnalysisResult,
  sport: Sport,
  profile: AgeProfile,
): GradeOutcome {
  return outcomeOfStanding(standingOf(result, profile).grades[sport], result, sport)
}

/** Both sports' grades at their thresholds, each at its own date. */
export function thresholdGrades(result: AnalysisResult, profile: AgeProfile): HeadlineGrades {
  return gradesOfStanding(result, standingOf(result, profile))
}
