import type { ReactNode } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatGrade } from '../gradeFormat'
import { gradeLevelText, notGradedText } from '../grades'
import type { AgeGap, GradeOutcome } from '../grades'
import { threshold } from '../records'
import { hrefFor } from '../route'
import { THRESHOLD_HEADING } from '../sports'
import { thresholdProperties } from '../thresholdBasis'
import { thresholdNeedsLine } from '../thresholdNeeds'
import { thresholdSpan } from '../thresholdRange'
import { ThresholdBasis } from './ThresholdBasis'

export interface SportHeroProps {
  sport: Sport
  result: AnalysisResult
  massKg: number
  units: UnitSystem
  /** The grade at the sport's threshold, or the reason there is none; null while the profile is missing. */
  outcome: GradeOutcome | null
  /** The year of birth or sex the grades still need; null when both are given. */
  missingAge: AgeGap | null
}

/** One figure of the hero's row: a small label over its value, which is the figure's own markup. */
function HeroFigure({
  label,
  testId,
  children,
}: {
  label: string
  testId: string
  children: ReactNode
}) {
  return (
    <div className="sport-hero__stat" data-testid={testId}>
      <dt className="sport-hero__label">{label}</dt>
      <dd className="sport-hero__value">{children}</dd>
    </div>
  )
}

/** The level and the grade of the threshold in words, or what the grade needs; null where there is nothing to say. */
function LevelFigure({
  outcome,
  missingAge,
}: {
  outcome: GradeOutcome | null
  missingAge: AgeGap | null
}) {
  if (outcome === null) {
    return missingAge === null ? null : (
      <HeroFigure testId="hero-level" label="Level">
        <p className="secondary">
          {`Age grades need your ${missingAge}.`}{' '}
          <a href={hrefFor({ page: 'profile' })}>{`Add your ${missingAge}`}</a>
        </p>
      </HeroFigure>
    )
  }
  return (
    <HeroFigure testId="hero-level" label="Level">
      {outcome.kind !== 'graded' ? (
        <span className="sport-hero__unit">{notGradedText(outcome)}</span>
      ) : (
        <p className="sport-hero__level">
          <span className="sport-hero__level-name">{gradeLevelText(outcome.grade)}</span>
          {' \u00b7 '}
          <span className="num sport-hero__level-value">
            {formatGrade(outcome.grade.centre.grade)}
          </span>
        </p>
      )}
    </HeroFigure>
  )
}

/**
 * The sport page's hero: its current status, with no chart. One serif title line over one row of three mono figures, each with
 * a small label: today's threshold with its range, the level and age grade it earns,. How the threshold was worked out stays as the panel under them. With no estimate the title is followed by
 * the effort that would give one.
 */
export function SportHero(props: SportHeroProps) {
  const { sport, result, massKg, units, outcome, missingAge } = props
  const hero = threshold(result, sport, massKg, units)
  // A range whose two ends print the same is one figure, which the threshold already is.
  const span = thresholdSpan(result, sport, massKg, units)
  const range = span?.includes('\u2013') ? span : null
  return (
    <section className="band sport-hero" data-sport={sport} aria-labelledby={`${sport}-threshold`}>
      <h2 id={`${sport}-threshold`} className="sport-hero__title">
        {THRESHOLD_HEADING[sport]}
      </h2>
      {hero ? (
        <>
          <dl className="sport-hero__stats">
            <HeroFigure testId="hero-threshold" label="Threshold">
              <p className="sport-hero__figure">
                <span className="display sport-hero__number">{hero.number}</span>
                {'\u00a0'}
                <span className="sport-hero__unit">{hero.unit}</span>
                {hero.sub && (
                  <>
                    {' '}
                    <span className="sport-hero__side">{hero.sub}</span>
                  </>
                )}
              </p>
              {range && <p className="sport-hero__range">{range}</p>}
            </HeroFigure>
            <LevelFigure outcome={outcome} missingAge={missingAge} />
          </dl>
          <ThresholdBasis
            sport={sport}
            rows={thresholdProperties(result, sport, massKg, units)}
            className="sport-hero__basis"
          />
        </>
      ) : (
        <p className="secondary">{thresholdNeedsLine(result, sport)}</p>
      )}
    </section>
  )
}
