import type { Sport } from '@rca/core/types'
import { GradingLink } from '../components/GradingLink'
import { LevelLadder } from '../components/LevelLadder'
import { formatGrade } from '../gradeFormat'
import { HEADLINE_LABEL, gradeLevelText, notGradedText } from '../grades'
import type { AgeGap, GradeOutcome } from '../grades'
import { hrefFor } from '../route'

/** A level longer than this is set a step smaller so it holds two lines. */
const LONG_LEVEL = 12

/** The effort's figure plain: a ride's watts carry ", estimated" from the records, which the level line leaves off. */
function plainEffort(effort: string): string {
  const suffix = ', estimated'
  return effort.endsWith(suffix) ? effort.slice(0, -suffix.length) : effort
}

export interface LevelPanelProps {
  sport: Sport
  /** The grade of the best 20 minutes, or the reason there is none; null while the profile is missing. */
  outcome: GradeOutcome | null
  /** The headline effort's figure such as "6:37 /mi", with ", estimated" after a ride's watts that are, which the panel drops. */
  effort: string | null
  /** The year of birth or sex the grades still need, named in the prompt; null when both are given. */
  missingAge: AgeGap | null
}

/** The level of the grade's centre and its percent at display size; a ride's range is drawn on the ladder below. */
function LevelFigure({ outcome }: { outcome: GradeOutcome & { kind: 'graded' } }) {
  const level = gradeLevelText(outcome.grade)
  return (
    <p className="display sport-hero__level">
      <span
        className={
          level.length > LONG_LEVEL
            ? 'sport-hero__level-name sport-hero__level-name--long'
            : 'sport-hero__level-name'
        }
      >
        {level}
      </span>
      <span className="sport-hero__level-value">{formatGrade(outcome.grade.centre.grade)}</span>
    </p>
  )
}

/**
 * The age grade of the best 20 minutes at display size with its percent, one line of the effort and the age it
 * was graded at, and the level ladder on neutral bands, a dot for a recorded effort and a ring with its range for
 * an estimated one. Without a year of birth and sex it asks for them; with a gap it says why.
 */
export function LevelPanel({ sport, outcome, effort, missingAge }: LevelPanelProps) {
  if (outcome === null && missingAge === null) return null
  return (
    <section
      className="sport-hero__panel sport-hero__levelpanel"
      aria-labelledby={`${sport}-level`}
    >
      <h2 id={`${sport}-level`} className="eyebrow sport-hero__eyebrow">
        {`Age grade, best ${HEADLINE_LABEL}`}
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
          <p className="sport-hero__grades">
            {effort ? `${plainEffort(effort)} at age ${outcome.age}.` : `At age ${outcome.age}.`}
          </p>
          <LevelLadder sport={sport} grade={outcome.grade} />
          <GradingLink />
        </>
      )}
    </section>
  )
}
