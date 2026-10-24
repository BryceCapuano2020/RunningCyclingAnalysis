import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import type { Sport } from '@rca/core/types'
import { HEADLINE_LABEL } from '../grades'
import type { GradeOutcome } from '../grades'
import { GradeSentence } from './GradeSentence'
import { GradingLink } from './GradingLink'
import { LevelLadder } from './LevelLadder'
import './AgeGradeBlock.css'

export interface AgeGradeBlockProps {
  sport: Sport
  outcome: GradeOutcome
  /** The headline effort the grade is for, such as "6:37 /mi, estimated", or null when none. */
  effort: string | null
}

/**
 * The grade, its level ladder and what it grades: the grade line names the effort it is for, and
 * its pace or watts. A ride's grade is estimated, and says so.
 */
export function AgeGradeBlock({ sport, outcome, effort }: AgeGradeBlockProps) {
  if (outcome.kind === 'gap') return <p className="secondary">{outcome.reason}</p>
  const { age, grade } = outcome
  const ride = sport === 'ride'
  const caption = ride
    ? `Graded through its running equivalent, at age ${age}, on the ${ROAD_STANDARDS_SOURCE.shortName}. The range in brackets is the 90% range.`
    : `Graded at age ${age}, on the ${ROAD_STANDARDS_SOURCE.shortName}.`
  return (
    <div className="age-grade">
      <p className="age-grade__line">
        <GradeSentence sport={sport} grade={grade} />
        {` · on your best ${HEADLINE_LABEL}${effort ? `, ${effort}` : ''}`}
      </p>
      <GradingLink />
      <LevelLadder sport={sport} grade={grade} />
      <p className="muted">{caption}</p>
    </div>
  )
}
