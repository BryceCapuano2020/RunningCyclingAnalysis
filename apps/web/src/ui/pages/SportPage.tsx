import { useState } from 'react'
import type { ReactNode } from 'react'
import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { SportCurves, TrendPoint } from '@rca/core/digest'
import type { EffortLengthS } from '@rca/core/digest/trendPoints'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { DEFAULT_VIEW, queryFromView } from '../activitiesView'
import { SportCurveChart, TrendChart } from '../charts'
import { AddSportFiles } from '../components/AddSportFiles'
import { AgeGradeBlock } from '../components/AgeGradeBlock'
import { HowToGetFilesButton } from '../components/HowToGetFiles'
import { recordGradeCell } from '../components/recordGrade'
import { SegmentedControl } from '../components/SegmentedControl'
import { SportRecords } from '../components/SportRecords'
import { WeightNote } from '../components/WeightNote'
import { ArrowRightIcon, SportIcon } from '../components/icons'
import { plural } from '../components/plural'
import { effortShareLine } from '../effortCaveat'
import { formatCount } from '../format/count'
import { recordChange } from '../recordChange'
import { recordRow, treadmillMarks } from '../recordRow'
import type { RecordRow } from '../recordRow'
import { FLAT_PACE_NOTE, distanceGrade, listedGradeNotes, sportGrade } from '../grades'
import type { AgeGap, AgeProfile } from '../grades'
import { hrefFor } from '../route'
import { formLine } from '../sportForm'
import {
  CURVE_TITLE,
  SPORT_LABEL,
  SPORT_PLURAL,
  THRESHOLD_LABEL,
  THRESHOLD_MEANING,
  thresholdNeedsText,
} from '../sports'
import { PAGE_HEADING_ID } from './pageHeading'
import {
  EFFORT_OPTIONS,
  activityNames,
  calendarDaysBetween,
  countSport,
  distanceRecords,
  effortOf,
  headlineEffort,
  isEstimatedRecord,
  nativeCurve,
  effortLabel,
  paceIsTime,
  refusalOf,
  sportRecords,
  threshold,
  valueAt,
} from '../records'
import type { SportRecord } from '../records'
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
  /** The year of birth or sex the grades still need, which the note names; null when both are given. */
  missingAge: AgeGap | null
  /** The window in days, or null for all time: the figures' scope is named by it. */
  rangeDays: number | null
  /** The period control, shown beside the heading. */
  controls: ReactNode
  /** The line that says what the page is based on, at its foot. */
  footnote?: ReactNode
  /** What to say when the sport has nothing in the period, naming the period. */
  emptyText: string
  /**
   * How many of the sport's activities the library holds, in all time. With none, the page has no period
   * to pick and asks for files; with some and none in the period, it offers All time.
   */
  inLibrary: number
  /**
   * Every visible activity, whatever the period. The period before's activities are not in the result,
   * so the power source of an earlier best is looked up here.
   */
  library: ActivitySummary[]
  /** Shows every activity, from the All time action an empty period offers. */
  onShowAll?: () => void
  /** Adds files, from the action an empty sport page offers. */
  onAddFiles: (files: File[]) => void
}

/** Days from the day the page opened to the day an activity was done, or null without an activity. */
function setDaysOf(activity: ActivitySummary | null, openedAt: number): number | null {
  return activity === null ? null : calendarDaysBetween(activity.startMs, openedAt)
}

/** The age grades need the field that is missing: asked once here, under the best efforts. */
function AgeNote({ missing }: { missing: AgeGap }) {
  return (
    <p className="muted">
      {`Age grades need your ${missing}.`}{' '}
      <a href={hrefFor({ page: 'profile' })}>{`Add your ${missing}`}</a>
    </p>
  )
}

/** A run distance's row label in sentence case, such as "Half marathon" from its record name. */
function rowLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
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
  missingAge,
  rangeDays,
  controls,
  footnote = null,
  emptyText,
  inLibrary,
  library,
  onShowAll,
  onAddFiles,
}: SportPageProps) {
  const count = countSport(result.activities, sport)
  // The time the page was opened at: a record's age counts from it, and a year shows only when the last
  // run is from an earlier year. Read once, so a later render does not move either.
  const [openedAt] = useState(() => Date.now())
  // A ride's figures use the body mass, so the page holds them until the weight is entered.
  const held = sport === 'ride' && !weighted
  const hero = threshold(result, sport, massKg, units)
  const records = sportRecords(result, sport, massKg, units)
  const graded = records.map((record) => ({
    record,
    // Each record is graded at the age on the date of its own effort.
    outcome: profile === null ? null : sportGrade(result, sport, record.durationS, profile),
  }))
  const distance = sport === 'run' ? distanceRecords(result.activities, units) : null
  // Each distance record is graded at the age on the day it was run, as the durations are.
  const distanceOutcomes = (distance?.records ?? []).map((record) =>
    profile === null
      ? null
      : distanceGrade(record.distanceM, record.seconds, record.activity.startMs, profile),
  )
  const headline =
    profile === null || held ? null : sportGrade(result, sport, HEADLINE_DURATION_S, profile)
  const current = nativeCurve(sport, result)
  const earlier = previous && previousLabel ? nativeCurve(sport, previous) : null
  // The activity behind the earlier period's best at a duration, found in the library.
  const earlierActivityAt = (durationS: number): ActivitySummary | null => {
    const id = earlier?.find((point) => point.durationS === durationS)?.activityId ?? null
    return id === null ? null : (library.find((activity) => activity.id === id) ?? null)
  }
  // A change is named only between two demonstrated figures: a ride's estimated watts on either side
  // leave it out, since two estimates moving is not a change in the rider.
  const changeOf = (record: SportRecord): string | null => {
    if (!earlier || !previousLabel) return null
    if (isEstimatedRecord(sport, record.activity)) return null
    if (isEstimatedRecord(sport, earlierActivityAt(record.durationS))) return null
    return recordChange(
      sport,
      valueAt(current, record.durationS),
      valueAt(earlier, record.durationS),
      units,
      previousLabel,
    )
  }
  // The list says a ride's lead and a run's no-standard gap once under it, so each row leaves them off.
  const rows: RecordRow[] = graded.map(({ record, outcome }) =>
    recordRow(sport, record, {
      label: effortLabel(record.durationS),
      grade: recordGradeCell(sport, outcome, record.covered, 'row'),
      change: changeOf(record),
      setDays: setDaysOf(record.activity, openedAt),
    }),
  )
  // A distance best is the run's own pace, not a flat pace, so it carries no Flat mark.
  const distanceRows: RecordRow[] = (distance?.records ?? []).map((record, index) => ({
    key: `distance-${record.distanceM}`,
    label: rowLabel(record.label),
    value: record.time,
    sub: paceIsTime(record.distanceM, units) ? null : record.pace,
    grade: recordGradeCell(sport, distanceOutcomes[index] ?? null, null, 'row'),
    tags: treadmillMarks('run', record.activity),
    change: null,
    setDays: setDaysOf(record.activity, openedAt),
    activity: record.activity,
  }))
  const listNotes = listedGradeNotes(sport, [
    ...graded.map(({ outcome }) => outcome),
    ...distanceOutcomes,
  ])
  const [effort, setEffort] = useState<EffortLengthS>(HEADLINE_DURATION_S)
  // The time the page was opened at, so a year shows only when the last run is from an earlier year.
  const form = formLine(result.activities, sport, units, openedAt)
  const measuredRides = result.activities.filter(
    (activity) => activity.sport === 'ride' && activity.powerSource === 'measured',
  ).length
  const someEstimated = records.some((record) => isEstimatedRecord(sport, record.activity))
  // The best 20 minutes by heart rate, as one line under the threshold meaning on either sport.
  const heartRateLine = effortShareLine(
    sport,
    result.effort.find((check) => check.durationS === HEADLINE_DURATION_S),
  )

  return (
    <div className="page-stack">
      <div className="page-head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1} className={`sport-page__title sport-${sport}`}>
          <SportIcon sport={sport} />
          {SPORT_LABEL[sport]}
        </h1>
        {inLibrary > 0 && controls}
      </div>
      {count === 0 ? (
        <section className="section">
          <p className="secondary">{emptyText}</p>
          {inLibrary === 0 ? (
            <div className="sport-page__actions">
              <AddSportFiles sport={sport} onAddFiles={onAddFiles} />
              <HowToGetFilesButton />
            </div>
          ) : (
            rangeDays !== null &&
            onShowAll && (
              <button type="button" className="btn" onClick={onShowAll}>
                Show all time
              </button>
            )
          )}
        </section>
      ) : held ? (
        <WeightNote />
      ) : (
        <>
          <section className="section" aria-labelledby={`${sport}-threshold`}>
            <h2 id={`${sport}-threshold`} className="eyebrow sport-page__threshold">
              {THRESHOLD_LABEL[sport]}
            </h2>
            {hero ? (
              <p className="sport-page__hero">
                <span className="hero-number">{hero.value}</span>
                {hero.sub && <span className="sport-page__hero-sub secondary">{hero.sub}</span>}
              </p>
            ) : (
              <p className="secondary">{thresholdNeedsText(refusalOf(result, sport))}</p>
            )}
            {hero && <p className="muted">{THRESHOLD_MEANING[sport]}</p>}
            {heartRateLine && <p className="muted">{heartRateLine}</p>}
            {headline && (
              <AgeGradeBlock
                sport={sport}
                outcome={headline}
                effort={headlineEffort(sport, records)}
              />
            )}
          </section>

          <section className="section" aria-labelledby={`${sport}-records`}>
            <h2 id={`${sport}-records`}>Best efforts</h2>
            {form && <p className="muted">{form}</p>}
            {missingAge !== null && <AgeNote missing={missingAge} />}
            {sport === 'ride' && someEstimated && (
              <p className="muted">
                {`Power meters measured ${formatCount(measuredRides)} of ${plural(count, 'ride', 'rides')}. Watts for the rest are estimated.`}{' '}
                <a href={hrefFor({ page: 'method' })}>How sure is this?</a>
              </p>
            )}
            <SportRecords rows={[...rows, ...distanceRows]} />
            {listNotes.map((note) => (
              <p key={note} className="muted">
                {note}
              </p>
            ))}
            {sport === 'run' && <p className="muted">{FLAT_PACE_NOTE}</p>}
            {distance?.partial && (
              <p className="muted">
                Runs added before distance bests were recorded don’t have them yet, so these may not
                be the fastest. Add those runs again to include them.
              </p>
            )}
            <a
              className="link-arrow"
              href={`#/activities?${queryFromView({ ...DEFAULT_VIEW, sport })}`}
            >
              {`See your ${SPORT_PLURAL[sport]}`}
              <ArrowRightIcon />
            </a>
          </section>

          <section className="section" aria-labelledby={`${sport}-trend`}>
            <h2 id={`${sport}-trend`}>Week by week</h2>
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

      {!held && count > 0 && (
        <section className="section" aria-labelledby={`${sport}-curve`}>
          <h2 id={`${sport}-curve`}>{CURVE_TITLE[sport]}</h2>
          <SportCurveChart
            sport={sport}
            curve={current}
            previous={earlier && previousLabel ? { curve: earlier, label: previousLabel } : null}
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
