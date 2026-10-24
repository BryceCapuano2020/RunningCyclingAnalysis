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
import { SportRecords } from '../components/SportRecords'
import { recordRow } from '../recordRow'
import type { RecordRow } from '../recordRow'
import { StandardsCredit } from '../components/StandardsCredit'
import { WeightNote } from '../components/WeightNote'
import { SportIcon } from '../components/icons'
import { plural } from '../components/plural'
import { GRADE_ADJUSTED_NOTE, SEX_NOUN, outcomeSentence, sportGrade } from '../grades'
import type { AgeProfile } from '../grades'
import { hrefFor } from '../route'
import { SPORT_LABEL, SPORT_PLURAL, THRESHOLD_EFFORT_TEXT, THRESHOLD_LABEL } from '../sports'
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
  /** False while no body weight is entered; a ride's figures then wait for it. */
  weighted: boolean
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
  /** The period control, shown beside the heading. */
  controls: ReactNode
  /** The line that says what the page is based on, at its foot. */
  footnote?: ReactNode
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
  weighted,
  profile,
  controls,
  footnote = null,
}: SportPageProps) {
  const count = countSport(result.activities, sport)
  // A ride's figures use the body mass, so the page holds them until the weight is entered.
  const held = sport === 'ride' && !weighted
  const hero = threshold(result, sport, massKg, units)
  const rows = sportRecords(result, sport, massKg, units).map((record) => ({
    record,
    // Each record is graded at the age on the date of its own effort.
    grade:
      profile === null
        ? null
        : outcomeSentence(sport, sportGrade(result, sport, record.durationS, profile), 'record'),
  }))
  const anyGrade = rows.some((row) => row.grade !== null)
  const distance = sport === 'run' ? distanceRecords(result.activities, units) : null
  // The sex the grades are for, named on the source line when any record shows a grade.
  const gradedSex = anyGrade && profile !== null ? profile.sex : null
  const [effort, setEffort] = useState<EffortLengthS>(HEADLINE_DURATION_S)
  const recordRows: RecordRow[] = [
    ...rows.map(({ record, grade }) =>
      recordRow(sport, record, { label: `Best ${formatDuration(record.durationS)}`, grade }),
    ),
    // A distance best is the run's own pace, not grade-adjusted, so it carries no GAP mark.
    ...(distance?.records ?? []).map((record) => ({
      key: `distance-${record.distanceM}`,
      label: `Best ${record.label}`,
      value: record.time,
      sub: record.pace,
      grade: null,
      tags: [],
      activity: record.activity,
    })),
  ]

  return (
    <div className="page-stack">
      <div className="page-head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1} className={`sport-page__title sport-${sport}`}>
          <SportIcon sport={sport} />
          {SPORT_LABEL[sport]}
        </h1>
        {controls}
      </div>
      <a className="link-arrow" href={hrefFor({ page: 'method' })}>
        How sure is this?
      </a>

      {count === 0 ? (
        <p className="secondary">
          {`No ${SPORT_PLURAL[sport]} in this period. Add ${SPORT_PLURAL[sport]} to see your records.`}
        </p>
      ) : held ? (
        <WeightNote />
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
                {`Needs harder efforts of ${THRESHOLD_EFFORT_TEXT} to estimate a threshold.`}
              </p>
            )}
            <p className="muted">
              {`Based on ${plural(count, SPORT_LABEL[sport].toLowerCase(), SPORT_PLURAL[sport])} in this period.`}
            </p>
          </section>

          <section className="section" aria-labelledby={`${sport}-records`}>
            <h2 id={`${sport}-records`}>Best efforts</h2>
            {sport === 'run' && <p className="muted">{GRADE_ADJUSTED_NOTE}</p>}
            {gradedSex !== null && (
              <p className="muted">
                {sport === 'ride'
                  ? `Ride age grades for a ${SEX_NOUN[gradedSex]} are estimates through the running equivalent, against the `
                  : `Age grades for a ${SEX_NOUN[gradedSex]} use the `}
                <StandardsCredit />
                {`. Age is counted from your birth year on the date of each effort${sport === 'ride' ? ', and a ride’s range is its model range.' : '.'}`}
              </p>
            )}
            <SportRecords rows={recordRows} />
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

      {!held && (
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
      )}

      {footnote}
    </div>
  )
}
