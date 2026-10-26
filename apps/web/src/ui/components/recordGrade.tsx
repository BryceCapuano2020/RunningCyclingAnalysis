import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { gapRecordText, isNoStandardGap } from '../grades'
import type { GradeContext, GradeOutcome } from '../grades'
import { GradeSentence } from './GradeSentence'

/**
 * A record's grade cell: its level as a sentence, or the short words that say why it has none. A
 * duration's grade also says the distance it is taken at, such as "5.0 km in 20 min". Shared by every
 * list of records, so a record reads the same on the sport page and the activity page. A list that says
 * its lead and its no-standard gap once under it passes 'row', and each row drops them.
 */
export function recordGradeCell(
  sport: Sport,
  outcome: GradeOutcome | null,
  covered: string | null,
  where: GradeContext,
): ReactNode {
  if (outcome === null) return null
  if (outcome.kind === 'graded') {
    return (
      <>
        <GradeSentence sport={sport} grade={outcome.grade} where={where} />
        {covered !== null && ` · ${covered}`}
      </>
    )
  }
  return where === 'row' && isNoStandardGap(outcome) ? null : gapRecordText(sport, outcome)
}
