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
 * A grade's sentence, with its level and percent, and its range, each kept on one line: a 320 px
 * screen breaks between the parts of the sentence, never inside one of them.
 */
export function GradeSentence({ sport, grade, where = 'card' }: GradeSentenceProps) {
  const { lead, level, value, range } = gradeParts(sport, grade, where)
  return (
    <>
      {lead && <>{`${lead} · `}</>}
      <span className="grade-sentence__unbroken">{`${level} · ${value}`}</span>
      {range && (
        <>
          {' '}
          <span className="grade-sentence__unbroken">{`(${range})`}</span>
        </>
      )}
    </>
  )
}
