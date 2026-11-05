import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { gapRecordText, gradeParts, isNoStandardGap } from '../grades'
import type { GradeContext, GradeOutcome } from '../grades'

/**
 * A record's grade cell on its row's one meta line: its level and percent, "Local 61%", or the short words that say why
 * it has none. The range and the distance an effort covered are the activity's to say, not the row's. Shared by every
 * list of records, so a record reads the same on the sport page and the activity page. A list that says its
 * no-standard gap once under it passes 'row', and each row drops it.
 */
export function recordGradeCell(
  sport: Sport,
  outcome: GradeOutcome | null,
  where: GradeContext,
): ReactNode {
  if (outcome === null) return null
  if (outcome.kind === 'graded') {
    const { level, value } = gradeParts(sport, outcome.grade, where)
    return (
      <>
        {level}
        {' '}
        <span className="num">{value}</span>
      </>
    )
  }
  return where === 'row' && isNoStandardGap(outcome) ? null : gapRecordText(sport, outcome)
}
