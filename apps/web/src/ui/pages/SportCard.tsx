import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'
import { formatDuration } from '@rca/core/units'
import { LevelLadder } from '../components/LevelLadder'
import { ArrowRightIcon, SportIcon } from '../components/icons'
import { formatDay } from '../format/date'
import { HEADLINE_LABEL, gradeSentence } from '../grades'
import type { GradeOutcome } from '../grades'
import { hrefFor } from '../route'
import { SPORT_LABEL, SPORT_NOUN, THRESHOLD_LABEL } from '../sports'
import { countSport, sportRecords, threshold } from '../records'
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
}

const ADD: Record<Sport, string> = {
  run: 'Add runs to see your running and your balance.',
  ride: 'Add rides to see your cycling and your balance.',
}

/** Durations the card's short profile lists: 5, 20 and 60 minutes. */
const PROFILE_S = new Set([300, 1200, 3600])

/** The grade, its level ladder and where it comes from, or the reason there is none to show. */
function AgeGrade({ sport, outcome }: { sport: Sport; outcome: GradeOutcome }) {
  if (outcome.kind === 'gap') return <p className="secondary">{outcome.reason}</p>
  const { age, grade } = outcome
  const caption =
    sport === 'ride'
      ? `Estimate from your best ${HEADLINE_LABEL}, aged ${age}. Graded through its running equivalent, on the ${ROAD_STANDARDS_SOURCE.shortName}.`
      : `Estimate from your best ${HEADLINE_LABEL}, aged ${age}, on the ${ROAD_STANDARDS_SOURCE.shortName}.`
  return (
    <div className="sport-card__grade">
      <p className="sport-card__grade-line">{gradeSentence(grade)}</p>
      <LevelLadder sport={sport} grade={grade} />
      <p className="muted">{caption}</p>
    </div>
  )
}

/**
 * One sport at a glance: the estimated threshold as the hero number, its age grade, and the best
 * efforts that show it, each naming the activity that set it.
 */
export function SportCard({ sport, result, units, massKg, grade }: SportCardProps) {
  const count = countSport(result.activities, sport)
  const headingId = `sport-card-${sport}`
  const hero = count > 0 ? threshold(result, sport, massKg, units) : null
  const records = sportRecords(result, sport, massKg, units).filter((r) =>
    PROFILE_S.has(r.durationS),
  )

  return (
    <section className={`card sport-card sport-card--${sport}`} aria-labelledby={headingId}>
      <h2 id={headingId} className="sport-card__name">
        <SportIcon sport={sport} />
        {SPORT_LABEL[sport]}
      </h2>
      {count === 0 ? (
        <p className="secondary">{ADD[sport]}</p>
      ) : (
        <>
          <div className="sport-card__hero">
            <p className="eyebrow">{THRESHOLD_LABEL[sport]}</p>
            {hero ? (
              <p>
                <span className="hero-number">{hero.value}</span>
                {hero.sub && <span className="sport-card__sub">{hero.sub}</span>}
              </p>
            ) : (
              <p className="secondary">{`Needs a hard effort of 2 to ${HEADLINE_LABEL}.`}</p>
            )}
          </div>
          {grade && <AgeGrade sport={sport} outcome={grade} />}
          {records.length > 0 && (
            <ul className="sport-card__records">
              {records.map((record) => (
                <li key={record.durationS}>
                  <span className="sport-card__duration">{formatDuration(record.durationS)}</span>
                  <span className="sport-card__value num">{record.value}</span>
                  {record.activity && (
                    <a
                      className="sport-card__source"
                      href={hrefFor({ page: 'activity', id: record.activity.id })}
                    >
                      {`${record.activity.name}, ${formatDay(record.activity.startMs)}`}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <a className="link-arrow" href={hrefFor({ page: sport })}>
        {`All ${SPORT_NOUN[sport]} records`}
        <ArrowRightIcon />
      </a>
    </section>
  )
}
