import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import type { Sport } from '@rca/core/types'
import { HEADLINE_LABEL, LEVEL_NOT_RANKING } from '../grades'
import type { GradeOutcome } from '../grades'
import { GradeSentence } from './GradeSentence'
import { GradesLink, GradingLink } from './GradingLink'
import { LevelLadder } from './LevelLadder'
import './AgeGradeBlock.css'

export interface AgeGradeBlockProps {
  sport: Sport
  outcome: GradeOutcome
  /** The headline effort the grade is for, such as "6:37 /mi, estimated", or null when none. */
  effort: string | null
  /**
   * Whether the caption names the age and the standard. A Balance card leaves that to the source line
   * under the cards, so its caption keeps only a ride's range note.
   */
  namesStandard?: boolean
}

/** What a ride's bracketed range is, under a ride's grade. */
const RANGE_NOTE = 'The range in brackets is the 90% range.'

/**
 * The grade, its level ladder and what it grades: the grade line names the effort it is for, and
 * its pace or watts. A ride's grade is estimated, and says so.
 */
export function AgeGradeBlock({
  sport,
  outcome,
  effort,
  namesStandard = true,
}: AgeGradeBlockProps) {
  if (outcome.kind === 'gap') return <p className="secondary">{outcome.reason}</p>
  const { age, grade } = outcome
  const ride = sport === 'ride'
  return (
    <div className="age-grade">
      <p className="age-grade__line">
        <GradeSentence sport={sport} grade={grade} />
        {` · on your best ${HEADLINE_LABEL}${effort ? `, ${effort}` : ''}`}
      </p>
      <GradingLink />
      <LevelLadder sport={sport} grade={grade} />
      {(namesStandard || ride) && (
        <p className="muted">
          {namesStandard && (
            <>
              {ride
                ? `Graded through its running equivalent, at age ${age}, on the `
                : `Graded at age ${age}, on the `}
              <GradesLink>{ROAD_STANDARDS_SOURCE.shortName}</GradesLink>.{` ${LEVEL_NOT_RANKING}`}
            </>
          )}
          {ride && `${namesStandard ? ' ' : ''}${RANGE_NOTE}`}
        </p>
      )}
    </div>
  )
}
