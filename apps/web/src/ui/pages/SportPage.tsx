import type { ReactNode } from 'react'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration } from '@rca/core/units'
import { CurveChart } from '../charts'
import { SportIcon } from '../components/icons'
import { plural } from '../components/plural'
import { formatDay } from '../format/date'
import { hrefFor } from '../route'
import { SPORT_LABEL, SPORT_PLURAL, THRESHOLD_LABEL } from '../sports'
import { PAGE_HEADING_ID } from './pageHeading'
import { countSport, sportRecords, threshold } from '../records'
import './SportPage.css'

export interface SportPageProps {
  sport: Sport
  result: AnalysisResult
  units: UnitSystem
  massKg: number
  /** The period control, shown beside the heading. */
  controls: ReactNode
}

/** One sport's records in its own units, the best-effort curve and the evidence behind them. */
export function SportPage({ sport, result, units, massKg, controls }: SportPageProps) {
  const count = countSport(result.activities, sport)
  const hero = threshold(result, sport, massKg, units)
  const records = sportRecords(result, sport, massKg, units)

  return (
    <div className="page-stack">
      <div className="page-head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1} className={`sport-page__title sport-${sport}`}>
          <SportIcon sport={sport} />
          {SPORT_LABEL[sport]}
        </h1>
        {controls}
      </div>

      {count === 0 ? (
        <p className="secondary">
          {`No ${SPORT_PLURAL[sport]} in this period. Add ${SPORT_PLURAL[sport]} to see your records.`}
        </p>
      ) : (
        <>
          <section className="section" aria-labelledby={`${sport}-threshold`}>
            <p id={`${sport}-threshold`} className="eyebrow">
              {THRESHOLD_LABEL[sport]}
            </p>
            {hero ? (
              <p className="sport-page__hero">
                <span className="hero-number">{hero.value}</span>
                {hero.sub && <span className="sport-page__hero-sub secondary">{hero.sub}</span>}
              </p>
            ) : (
              <p className="secondary">
                Needs harder efforts of 2 to 20 minutes to estimate a threshold.
              </p>
            )}
            <p className="muted">
              {`Based on ${plural(count, SPORT_LABEL[sport].toLowerCase(), SPORT_PLURAL[sport])} in this period.`}
            </p>
          </section>

          <section className="section" aria-labelledby={`${sport}-records`}>
            <h2 id={`${sport}-records`}>Best efforts</h2>
            {sport === 'run' && (
              <p className="muted">Paces are grade-adjusted: the flat pace with the same effort.</p>
            )}
            <ul className="sport-page__records">
              {records.map((record) => (
                <li key={record.durationS} className="sport-page__record">
                  <span className="eyebrow">{`Best ${formatDuration(record.durationS)}`}</span>
                  <span className="stat-number">{record.value}</span>
                  {record.sub && <span className="secondary">{record.sub}</span>}
                  {record.activity && (
                    <a href={hrefFor({ page: 'activity', id: record.activity.id })}>
                      {`${record.activity.name}, ${formatDay(record.activity.startMs)}`}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section className="section" aria-labelledby={`${sport}-curve`}>
        <h2 id={`${sport}-curve`}>Every duration</h2>
        <CurveChart
          runCurve={result.runCurve}
          rideMetabolicCurve={result.rideMetabolicCurve}
          rideCurve={result.rideCurve}
          units={units}
          activityNames={Object.fromEntries(result.activities.map((a) => [a.id, a.name]))}
        />
      </section>
    </div>
  )
}
