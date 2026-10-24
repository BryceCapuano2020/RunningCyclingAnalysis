import { useState } from 'react'
import type { ReactNode } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { SportCurves, TrendPoint } from '@rca/core/digest'
import type { EffortLengthS } from '@rca/core/digest/trendPoints'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration } from '@rca/core/units'
import { SportCurveChart, TrendChart } from '../charts'
import { SegmentedControl } from '../components/SegmentedControl'
import { StandardsCredit } from '../components/StandardsCredit'
import { SportIcon } from '../components/icons'
import { plural } from '../components/plural'
import { formatDay } from '../format/date'
import { SEX_NOUN, outcomeSentence, sportGrade } from '../grades'
import type { AgeProfile } from '../grades'
import { hrefFor } from '../route'
import { SPORT_LABEL, SPORT_PLURAL, THRESHOLD_LABEL } from '../sports'
import { PAGE_HEADING_ID } from './pageHeading'
import {
  EFFORT_OPTIONS,
  activityNames,
  countSport,
  distanceRecords,
  effortOf,
  nativeCurve,
  sportRecords,
  threshold,
} from '../records'
import './SportPage.css'

export interface SportPageProps {
  sport: Sport
  result: AnalysisResult
  /** The best efforts of the period before the selected one, or null for all time. */
  previous: SportCurves | null
  /** The label of that period, such as "Previous 6 weeks". */
  previousLabel: string | null
  /** The weekly trend of each effort length over the period. */
  trends: Readonly<Record<EffortLengthS, readonly TrendPoint[]>>
  /** The trailing window of each trend point, in days. */
  windowDays: number
  units: UnitSystem
  massKg: number
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
  /** The period control, shown beside the heading. */
  controls: ReactNode
}

/** One sport's records in its own units, the best-effort curve and the evidence behind them. */
export function SportPage({
  sport,
  result,
  previous,
  previousLabel,
  trends,
  windowDays,
  units,
  massKg,
  profile,
  controls,
}: SportPageProps) {
  const count = countSport(result.activities, sport)
  const hero = threshold(result, sport, massKg, units)
  const rows = sportRecords(result, sport, massKg, units).map((record) => ({
    record,
    // Each record is graded at the age on the date of its own effort.
    grade:
      profile === null
        ? null
        : outcomeSentence(sportGrade(result, sport, record.durationS, profile)),
  }))
  const anyGrade = rows.some((row) => row.grade !== null)
  const distance = sport === 'run' ? distanceRecords(result.activities, units) : null
  // The sex the grades are for, named on the source line when any record shows a grade.
  const gradedSex = anyGrade && profile !== null ? profile.sex : null
  const [effort, setEffort] = useState<EffortLengthS>(HEADLINE_DURATION_S)

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
            {gradedSex !== null && (
              <p className="muted">
                Age grades for a {SEX_NOUN[gradedSex]} are estimates against the <StandardsCredit />
                . Age is counted from your birth year on the date of each effort
                {sport === 'ride' ? ', and a ride’s range is its model range.' : '.'}
              </p>
            )}
            <ul className="sport-page__records">
              {rows.map(({ record, grade }) => (
                <li key={record.durationS} className="sport-page__record">
                  <span className="eyebrow">{`Best ${formatDuration(record.durationS)}`}</span>
                  <span className="stat-number">{record.value}</span>
                  {record.sub && <span className="secondary">{record.sub}</span>}
                  {grade && <span className="secondary">{grade}</span>}
                  {record.activity && (
                    <a href={hrefFor({ page: 'activity', id: record.activity.id })}>
                      {`${record.activity.name}, ${formatDay(record.activity.startMs)}`}
                    </a>
                  )}
                </li>
              ))}
              {distance?.records.map((record) => (
                <li key={`distance-${record.distanceM}`} className="sport-page__record">
                  <span className="eyebrow">{`Best ${record.label}`}</span>
                  <span className="stat-number">{record.time}</span>
                  <span className="secondary">{record.pace}</span>
                  <a href={hrefFor({ page: 'activity', id: record.activity.id })}>
                    {`${record.activity.name}, ${formatDay(record.activity.startMs)}`}
                  </a>
                </li>
              ))}
            </ul>
            {distance?.partial && (
              <p className="muted">
                Distance records cover runs added since distance records were introduced.
              </p>
            )}
          </section>

          <section className="section" aria-labelledby={`${sport}-trend`}>
            <h2 id={`${sport}-trend`}>Fitness over time</h2>
            <SegmentedControl
              legend="Effort length"
              options={EFFORT_OPTIONS}
              selected={String(effort)}
              onSelect={(value) => {
                const next = effortOf(value)
                if (next !== undefined) setEffort(next)
              }}
            />
            <TrendChart
              sport={sport}
              points={trends[effort]}
              massKg={massKg}
              units={units}
              windowDays={windowDays}
              effortS={effort}
            />
          </section>
        </>
      )}

      <section className="section" aria-labelledby={`${sport}-curve`}>
        <h2 id={`${sport}-curve`}>Every duration</h2>
        <SportCurveChart
          sport={sport}
          curve={nativeCurve(sport, result)}
          previous={
            previous && previousLabel
              ? { curve: nativeCurve(sport, previous), label: previousLabel }
              : null
          }
          massKg={massKg}
          units={units}
          activityNames={activityNames(result.activities)}
        />
      </section>
    </div>
  )
}
