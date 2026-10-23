import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration } from '@rca/core/units'
import { ArrowRightIcon, SportIcon } from '../components/icons'
import { formatDay } from '../format/date'
import { hrefFor } from '../route'
import { SPORT_LABEL, SPORT_NOUN, THRESHOLD_LABEL } from '../sports'
import { countSport, sportRecords, threshold } from '../records'
import './SportCard.css'

export interface SportCardProps {
  sport: Sport
  result: AnalysisResult
  units: UnitSystem
  massKg: number
}

const ADD: Record<Sport, string> = {
  run: 'Add runs to see your running and your balance.',
  ride: 'Add rides to see your cycling and your balance.',
}

/** Durations the card's short profile lists: 5, 20 and 60 minutes. */
const PROFILE_S = new Set([300, 1200, 3600])

/**
 * One sport at a glance: the estimated threshold as the hero number, and the best efforts that
 * show it, each naming the activity that set it.
 */
export function SportCard({ sport, result, units, massKg }: SportCardProps) {
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
              <p className="secondary">Needs a hard effort of 2 to 20 minutes.</p>
            )}
          </div>
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
