import type { Sport } from '@rca/core/types'
import { LevelLadder } from '../components/LevelLadder'
import { formatGrade } from '../gradeFormat'
import { gradeLevelText, notGradedText } from '../grades'
import type { AgeGap, GradeOutcome } from '../grades'
import { hrefFor } from '../route'

export interface LevelPanelProps {
  sport: Sport
  /** The grade at the sport's threshold, or the reason there is none; null while the profile is missing. */
  outcome: GradeOutcome | null
  /** The year of birth or sex the grades still need, named in the prompt; null when both are given. */
  missingAge: AgeGap | null
}

/** The level of the grade's centre and its percent on one line: "Local · 61%". */
function LevelFigure({ outcome }: { outcome: GradeOutcome & { kind: 'graded' } }) {
  return (
    <p className="sport-hero__level">
      <span className="sport-hero__level-name">{gradeLevelText(outcome.grade)}</span>
      {' · '}
      <span className="num sport-hero__level-value">{formatGrade(outcome.grade.centre.grade)}</span>
    </p>
  )
}

/**
 * The age grade at threshold: its level and percent on one line and the level ladder (the threshold it grades is the
 * figure beside it, so no line repeats it), a dot for a recorded effort and a ring with its range for
 * an estimated one. Without a year of birth and sex it asks for them; with a gap it says why.
 */
export function LevelPanel({ sport, outcome, missingAge }: LevelPanelProps) {
  if (outcome === null && missingAge === null) return null
  return (
    <section
      className="sport-hero__panel sport-hero__levelpanel"
      aria-labelledby={`${sport}-level`}
    >
      <h2 id={`${sport}-level`} className="sport-hero__title">
        Age grade at threshold
      </h2>
      {outcome === null ? (
        <p className="secondary">
          {`Age grades need your ${missingAge}.`}{' '}
          <a href={hrefFor({ page: 'profile' })}>{`Add your ${missingAge}`}</a>
        </p>
      ) : outcome.kind !== 'graded' ? (
        <p className="secondary">{notGradedText(outcome)}</p>
      ) : (
        <>
          <LevelFigure outcome={outcome} />
          <LevelLadder sport={sport} grade={outcome.grade} />
        </>
      )}
    </section>
  )
}
