import type { Sport } from '@rca/core/types'
import { GradingLink } from '../components/GradingLink'
import { LevelLadder } from '../components/LevelLadder'
import { HEADLINE_LABEL, gradeParts, notGradedText } from '../grades'
import type { AgeGap, GradeOutcome } from '../grades'
import { hrefFor } from '../route'
import { BasisChip } from './StatTile'

/** A level longer than this is set a step smaller so it holds two lines. */
const LONG_LEVEL = 12

/** A figure with its "estimated" in brackets, so it reads as one phrase before "on your best 20 min". */
function effortPhrase(effort: string): string {
  const suffix = ', estimated'
  return effort.endsWith(suffix) ? `${effort.slice(0, -suffix.length)} (estimated)` : effort
}

export interface LevelPanelProps {
  sport: Sport
  /** The grade of the best 20 minutes, or the reason there is none; null while the profile is missing. */
  outcome: GradeOutcome | null
  /** The headline effort's figure such as "6:37 /mi", with "estimated" for a ride's watts that are. */
  effort: string | null
  /** The year of birth or sex the grades still need, named in the prompt; null when both are given. */
  missingAge: AgeGap | null
}

/** The level and its percent at display size, a ride's range and its estimated chip beside them. A range across two bands names no level. */
function LevelFigure({
  sport,
  outcome,
}: {
  sport: Sport
  outcome: GradeOutcome & { kind: 'graded' }
}) {
  const { lead, level, value, range } = gradeParts(sport, outcome.grade)
  return (
    <>
      <p className="display sport-hero__level">
        {level === null ? null : (
          <span
            className={
              level.length > LONG_LEVEL
                ? 'sport-hero__level-name sport-hero__level-name--long'
                : 'sport-hero__level-name'
            }
          >
            {level}
          </span>
        )}
        <span className="sport-hero__level-value">{value}</span>
      </p>
      {lead !== null && (
        <p className="sport-hero__level-basis">
          <BasisChip basis="estimated" />
          {range !== null && <span className="muted">{`(${range})`}</span>}
        </p>
      )}
    </>
  )
}

/**
 * The age grade of the best 20 minutes at display size with its percent, one line of the effort and the age it
 * was graded at, and the level ladder on neutral bands, a dot for a recorded effort and a ring for an estimated
 * one. Without a year of birth and sex it asks for them; with a gap it says why.
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
          <LevelFigure sport={sport} outcome={outcome} />
          <p className="sport-hero__grades">
            {effort ? `${effortPhrase(effort)} at age ${outcome.age}.` : `At age ${outcome.age}.`}
          </p>
          <LevelLadder sport={sport} grade={outcome.grade} />
          <GradingLink />
        </>
      )}
    </section>
  )
}
