import type { AthleteSettings } from '@rca/core/athlete'
import type { AgeProfile } from '@rca/core/grade'
import { gradedLiftOf, liftCornerGrade, liftLevelTotals } from '@rca/core/lift'
import type { GradedEstimate, LiftSummary } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'
import { levelRangeRows } from '../levelRanges'
import type { LevelRangeRow } from '../levelRanges'

/**
 * The Lift page's Levels table: the big three total that earns each level at the athlete's age (today's), sex and body mass, from
 * core's `liftLevelTotals`, the inverse of the grade the hero's lift corner takes. The athlete's own row is the level of that
 * corner (`liftCornerGrade`), so it is the level Balance names. Null while the year of birth, sex or a body mass the athlete
 * entered is missing, or where the standard has no grade (a mass or age outside what it is fitted for).
 */
export function liftLevelRowsOf(
  summaries: readonly LiftSummary[],
  profile: AgeProfile | null,
  settings: AthleteSettings,
  units: UnitSystem,
  today: string,
): LevelRangeRow[] | null {
  if (profile === null || settings.massAssumed === true) return null
  const bands = liftLevelTotals(profile, today, settings.massKg, units)
  if (bands === null) return null
  const estimates = summaries.flatMap((summary): GradedEstimate[] => {
    const lift = gradedLiftOf(summary.exercise, summary.equipment)
    return lift === null || summary.estimate === null ? [] : [{ lift, estimate: summary.estimate }]
  })
  const corner = liftCornerGrade(estimates, profile, settings)
  return levelRangeRows(
    'lift',
    bands,
    units,
    corner.kind === 'graded' ? corner.grade.centre.level : null,
  )
}
