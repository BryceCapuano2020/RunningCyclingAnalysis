import { gradeParts } from '../grades'
import type { GradeContext, SportGrade } from '../grades'
import type { Sport } from '@rca/core/types'
import './GradeSentence.css'

export interface GradeSentenceProps {
  sport: Sport
  grade: SportGrade
  where?: GradeContext
}

/**
 * A grade's sentence: its level, then its percent and its range. A ride's range can name two levels,
 * so the level may wrap between its words. The percent and the range each stay whole on one line, the lead's
 * dot stays with the level's first word, and the line may break before the dot, so a long level at a large text
 * size wraps instead of widening the page.
 */
export function GradeSentence({ sport, grade, where = 'card' }: GradeSentenceProps) {
  const { lead, level, value, range } = gradeParts(sport, grade, where)
  return (
    <>
      {/* A no-break space after the dot keeps it with the level, so a line never ends on "Estimated ·". */}
      {lead && <>{`${lead} ·\u00A0`}</>}
      {level} <span className="grade-sentence__unbroken">{`· ${value}`}</span>
      {range && (
        <>
          {' '}
          <span className="grade-sentence__unbroken">{`(${range})`}</span>
        </>
      )}
    </>
  )
}
