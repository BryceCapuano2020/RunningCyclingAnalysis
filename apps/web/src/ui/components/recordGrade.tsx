import type { ReactNode } from 'react'
import type { Sport } from '@rca/core/types'
import { gapRecordText } from '../grades'
import type { GradeOutcome } from '../grades'
import { GradeSentence } from './GradeSentence'

/**
 * A record's grade cell: its level as a sentence, or the short words that say why it has none. Shared
 * by every list of records, so a record reads the same on the sport page and the activity page.
 */
export function recordGradeCell(sport: Sport, outcome: GradeOutcome | null): ReactNode {
  if (outcome === null) return null
  if (outcome.kind === 'graded') {
    return <GradeSentence sport={sport} grade={outcome.grade} where="record" />
  }
  return gapRecordText(sport, outcome)
}
