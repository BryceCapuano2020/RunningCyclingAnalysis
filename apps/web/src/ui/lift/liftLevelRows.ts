import type { LiftResults } from '@rca/core/lift'
import type { UnitSystem } from '@rca/core/units'
import { levelRangeRows } from '../levelRanges'
import type { LevelRangeRow } from '../levelRanges'

/**
 * The Lift page's Levels table: the big three total that earns each level at the athlete's age (today's), sex and body mass, which
 * the lift results hold (`liftResultsOf`, from core's `liftLevelTotals`, the inverse of the grade the hero's lift corner takes). The
 * athlete's own row is the level of that corner, so it is the level Balance names. Null while the year of birth, sex or a body mass
 * the athlete entered is missing, or where the standard has no grade (a mass or age outside what it is fitted for).
 */
export function liftLevelRowsOf(results: LiftResults, units: UnitSystem): LevelRangeRow[] | null {
  const bands = results.levels[units]
  if (bands === null) return null
  const { corner } = results
  return levelRangeRows(
    'lift',
    bands,
    units,
    corner.kind === 'graded' ? corner.grade.centre.level : null,
  )
}
