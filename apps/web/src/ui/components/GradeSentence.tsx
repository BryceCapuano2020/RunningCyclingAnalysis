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
 * so the level may wrap between its words. The percent and the range each stay whole on one line.
 */
export function GradeSentence({ sport, grade, where = 'card' }: GradeSentenceProps) {
  const { lead, level, value, range } = gradeParts(sport, grade, where)
  return (
    <>
      {lead && <>{`${lead} · `}</>}
      {level}
      <span className="grade-sentence__unbroken">{` · ${value}`}</span>
      {range && (
        <>
          {' '}
          <span className="grade-sentence__unbroken">{`(${range})`}</span>
        </>
      )}
    </>
  )
}
