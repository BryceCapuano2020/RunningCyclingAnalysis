import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { formatDuration } from '@rca/core/units'
import { LevelLadder } from '../components/LevelLadder'
import { SportRecords } from '../components/SportRecords'
import { recordRow } from '../recordRow'
import { GradingLink } from '../components/GradingLink'
import { WeightNote } from '../components/WeightNote'
import { ArrowRightIcon, SportIcon } from '../components/icons'
import { HEADLINE_LABEL, GRADE_ADJUSTED_NOTE, gradeRangeBracket, gradeSentence } from '../grades'
import type { GradeOutcome, SportGrade } from '../grades'
import { hrefFor } from '../route'
import {
  SPORT_LABEL,
  SPORT_PLURAL,
  THRESHOLD_LABEL,
  THRESHOLD_MEANING,
  thresholdNeedsText,
} from '../sports'
import { CHIP_DURATIONS_S, isEstimatedRecord, refusalOf, sportRecords, threshold } from '../records'
import './SportCard.css'

export interface SportCardProps {
  sport: Sport
  result: AnalysisResult
  units: UnitSystem
  massKg: number
  /**
   * The sport's grade at the headline duration. Null while the year of birth or the sex is missing,
   * and the Balance page asks for them once rather than on each card.
   */
  grade: GradeOutcome | null
  /** False while no body weight is entered; a ride's figures then wait for it. */
  weighted: boolean
}

/**
 * The grade's sentence on the grade line, from gradeSentence. Its range bracket is set apart in a
 * span, so a ride's range stays on one line when the line wraps.
 */
function GradeHead({ sport, grade }: { sport: Sport; grade: SportGrade }) {
  const sentence = gradeSentence(sport, grade)
  const bracket = gradeRangeBracket(grade)
  const head = sentence.slice(0, sentence.length - bracket.length)
  return (
    <>
      {head}
      {bracket && (
        <>
          {' '}
          <span className="sport-card__range">{bracket.trim()}</span>
        </>
      )}
    </>
  )
}

/**
 * The grade, its level ladder and what it grades. The line names the effort it is for, and its
 * pace or watts; a ride's watts from virtual power are tagged estimated.
 */
function AgeGrade({
  sport,
  outcome,
  effort,
}: {
  sport: Sport
  outcome: GradeOutcome
  effort: string | null
}) {
  if (outcome.kind === 'gap') return <p className="secondary">{outcome.reason}</p>
  const { age, grade } = outcome
  const ride = sport === 'ride'
  const caption = ride
    ? `Graded through its running equivalent, at age ${age}, on the ${ROAD_STANDARDS_SOURCE.shortName}. The range in brackets is the 90% range.`
    : `Graded at age ${age}, on the ${ROAD_STANDARDS_SOURCE.shortName}.`
  return (
    <div className="sport-card__grade">
      <p className="sport-card__grade-line">
        <GradeHead sport={sport} grade={grade} />
        {` · on your best ${HEADLINE_LABEL}${effort ? `, ${effort}` : ''}`}
      </p>
      <GradingLink />
      <LevelLadder sport={sport} grade={grade} />
      {!ride && <p className="muted">{GRADE_ADJUSTED_NOTE}</p>}
      <p className="muted">{caption}</p>
    </div>
  )
}

/**
 * One sport at a glance: the estimated threshold as the hero number, its age grade, and the best
 * efforts that show it, each naming the activity that set it. A ride's figures wait for the weight.
 */
export function SportCard({ sport, result, units, massKg, grade, weighted }: SportCardProps) {
  const headingId = `sport-card-${sport}`
  // A ride's figures use the body mass, so they are held until it is entered; a run's are not.
  const held = sport === 'ride' && !weighted
  const hero = held ? null : threshold(result, sport, massKg, units)
  const records = held
    ? []
    : sportRecords(result, sport, massKg, units).filter((record) =>
        CHIP_DURATIONS_S.includes(record.durationS),
      )
  const headline = records.find((record) => record.durationS === HEADLINE_DURATION_S)
  const effort = headline
    ? `${headline.value}${isEstimatedRecord(sport, headline.activity) ? ', estimated' : ''}`
    : null

  return (
    <section className={`card sport-card sport-card--${sport}`} aria-labelledby={headingId}>
      <h2 id={headingId} className="sport-card__name">
        <SportIcon sport={sport} />
        {SPORT_LABEL[sport]}
      </h2>
      <>
        <div className="sport-card__hero">
          <p className="eyebrow">{THRESHOLD_LABEL[sport]}</p>
          {held ? (
            <WeightNote />
          ) : hero ? (
            <p>
              <span className="hero-number">
                {hero.number}
                <span className="hero-number__unit"> {hero.unit}</span>
              </span>
              {hero.sub && <span className="sport-card__sub">{hero.sub}</span>}
            </p>
          ) : (
            <p className="secondary">{thresholdNeedsText(refusalOf(result, sport))}</p>
          )}
          {hero && <p className="muted">{THRESHOLD_MEANING[sport]}</p>}
        </div>
        {!held && grade && <AgeGrade sport={sport} outcome={grade} effort={effort} />}
        {records.length > 0 && (
          <SportRecords
            rows={records.map((record) =>
              recordRow(sport, record, { label: formatDuration(record.durationS), grade: null }),
            )}
          />
        )}
      </>
      <a className="link-arrow" href={hrefFor({ page: sport })}>
        {`All ${SPORT_PLURAL[sport]}`}
        <ArrowRightIcon />
      </a>
    </section>
  )
}
