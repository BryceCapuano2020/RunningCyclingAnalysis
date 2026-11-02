import { effortsCount } from '@rca/core/digest'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { EarnedRecord } from '@rca/core/records'
import type { UnitSystem } from '@rca/core/units'
import { INDOOR_NOTE } from '../analysis/indoorCopy'
import { GradingLink } from '../components/GradingLink'
import { SportRecords } from '../components/SportRecords'
import { WeightNote } from '../components/WeightNote'
import { recordGradeCell } from '../components/recordGrade'
import { splitsListed, type SplitsLoad, type SplitsViewName } from '../components/splitRows'
import {
  TIMING_NOTE,
  TIMING_NOTE_LAPS,
  distanceGrade,
  listedGradeNotes,
  sportGrade,
} from '../grades'
import type { AgeProfile } from '../grades'
import { periodBestText } from '../periodCopy'
import { recordRow } from '../recordRow'
import type { RecordRow } from '../recordRow'
import {
  chipLabels,
  distanceRecords,
  effortLabel,
  ownDistanceRecords,
  paceIsTime,
  sportRecords,
} from '../records'
import { SPORT_LABEL } from '../sports'
import { hrefFor } from '../route'

export interface ActivityBestsProps {
  activity: ActivitySummary
  /** The result the period's bests come from. */
  result: AnalysisResult
  units: UnitSystem
  massKg: number
  /** False while no body weight is entered: a ride's bests wait for it, as the cards hold them. */
  weightKnown: boolean
  profile: AgeProfile | null
  /** Whether the activity is in the period the result covers. Outside it, there are no period bests to name. */
  inPeriod: boolean
  /** The period the result covers. Named on the page wherever it is used, never left to be guessed. */
  period?: Period
  /** The records the activity holds across the whole library, which the record chips above show. */
  earned: readonly EarnedRecord[]
  /** The run's splits as the page holds them, which say whether the timing note is on the page. */
  splitsLoad: SplitsLoad
  /** The view of the splits that is open, which says what their timing note claims. */
  splitsView: SplitsViewName
}

/** Why a ride without measured power has no power curve, as the page says it. */
const NO_POWER_CURVE: Record<'virtual' | 'none', string> = {
  virtual: 'No power curve: an estimate is made only on climbs.',
  none: 'No power curve: this ride has no power data.',
}

/** The mark an all-time record carries, in the same chip as the marks of the figure. */
const ALL_TIME_MARK = 'All-time record'

/**
 * The best efforts this activity set, as one records list: the bests it holds over the period the page
 * names, then the run distances it has its own time at. A best that is an all-time record says so, and
 * one that is the best of the period says which period; an activity outside the period has no period
 * bests, and its all-time records are named even though the period holds no figure for them. Each is
 * graded at its own date and linked to How is this graded?. The list says nothing when it has no best,
 * so an activity without one is not told it has none. An indoor run holds no best: its own distance
 * times show, ungraded and unmarked, under a line that says its pace is not used for bests.
 */
export function ActivityBests({
  activity,
  result,
  units,
  massKg,
  weightKnown,
  profile,
  inPeriod,
  period,
  earned,
  splitsLoad,
  splitsView,
}: ActivityBestsProps) {
  const sport = activity.sport
  // An indoor run's times are shown as run, but they are no best and carry no grade.
  const counts = effortsCount(activity)
  const periodMark = period === undefined ? null : periodBestText(period)
  // A period of all time already holds every record, so the sport page has nothing to switch to.
  const allTimeShown = period !== undefined && period.days === null
  const bests = inPeriod
    ? sportRecords(result, sport, massKg, units).filter(
        (record) => record.activity?.id === activity.id,
      )
    : []
  const distances = ownDistanceRecords(activity, units)
  // The period's distance bests, found over the activities the result holds, when there are times to mark.
  const periodDistances =
    inPeriod && distances.length > 0 ? distanceRecords(result.activities, units).records : []
  // The records the chips name, which are the only ones marked, so the marks and the chips agree.
  const chipped = new Set(chipLabels(earned))
  // The all-time records the chips name that the period's curve gives no figure for here.
  const unfigured = chipLabels(earned.filter((record) => record.kind === 'duration')).filter(
    (label) => !bests.some((record) => `Best ${effortLabel(record.durationS)}` === label),
  )
  if (bests.length === 0 && distances.length === 0 && unfigured.length === 0) {
    if (!counts) return <p className="secondary">{INDOOR_NOTE}</p>
    // A ride with no measured power has no power curve, and the page says why rather than leaving it out.
    const reason =
      sport === 'ride' && activity.powerSource !== 'measured'
        ? NO_POWER_CURVE[activity.powerSource]
        : null
    return reason === null ? null : <p className="secondary">{reason}</p>
  }
  // A ride's bests use the body mass, so they wait for the weight, as the cards' do.
  if (sport === 'ride' && !weightKnown) {
    return (
      <section className="section" aria-labelledby="activity-bests">
        <h2 id="activity-bests">Best efforts set here</h2>
        <WeightNote />
      </section>
    )
  }
  const durationItems = bests.map((record) => ({
    record,
    outcome: profile === null ? null : sportGrade(result, sport, record.durationS, profile),
  }))
  const distanceItems = distances.map((record) => ({
    record,
    outcome:
      profile === null || !counts
        ? null
        : distanceGrade(record.distanceM, record.seconds, activity, profile),
  }))
  const outcomes = [...durationItems, ...distanceItems].map((item) => item.outcome)
  const anyGraded = outcomes.some((outcome) => outcome?.kind === 'graded')
  // The list says a ride's lead and a run's no-standard gap once under it, so each row leaves them off.
  const listNotes = listedGradeNotes(sport, outcomes, [
    ...durationItems.map(({ record }) => effortLabel(record.durationS)),
    ...distanceItems.map(({ record }) => record.label),
  ])
  // A record of all time says so; else a best of the period says which period. Only one of them shows.
  const scopeMark = (allTime: boolean, ofPeriod: boolean): string[] => {
    if (allTime) return [ALL_TIME_MARK]
    return ofPeriod && periodMark !== null ? [periodMark] : []
  }
  // The page is the activity, so its rows name no activity of their own.
  const rows: RecordRow[] = [
    ...durationItems.map(({ record, outcome }) => {
      const row = recordRow(sport, record, {
        label: `Best ${effortLabel(record.durationS)}`,
        grade: recordGradeCell(sport, outcome, record.covered, 'row'),
        tags: scopeMark(chipped.has(`Best ${effortLabel(record.durationS)}`), true),
      })
      row.activity = null
      return row
    }),
    ...distanceItems.map(({ record, outcome }): RecordRow => {
      const ofPeriod = periodDistances.some(
        (best) => best.distanceM === record.distanceM && best.activity.id === activity.id,
      )
      return {
        key: `distance-${record.distanceM}`,
        label: counts ? `Best ${record.label}` : record.label,
        value: record.time,
        // In miles the mile, and in kilometres the kilometre, is its own time, so it has no pace to show.
        sub: paceIsTime(record.distanceM, units) ? null : record.pace,
        grade: recordGradeCell(sport, outcome, null, 'row'),
        tags: scopeMark(chipped.has(`Best ${record.label}`), ofPeriod),
        change: null,
        setDays: null,
        activity: null,
      }
    }),
  ]
  return (
    <section className="section" aria-labelledby="activity-bests">
      <h2 id="activity-bests">{counts ? 'Best efforts set here' : 'Distance times'}</h2>
      {rows.length > 0 && <SportRecords rows={rows} />}
      {unfigured.length > 0 && (
        <p className="secondary">
          {`All-time records here: ${unfigured.join(', ')}. ${allTimeShown ? 'See' : 'Choose All time on'} the `}
          <a href={hrefFor({ page: sport })}>{`${SPORT_LABEL[sport]} page`}</a>
          {allTimeShown ? ' for their figures.' : ' to see their figures.'}
        </p>
      )}
      {listNotes.map((note) => (
        <p key={note} className="muted">
          {note}
        </p>
      ))}
      {distances.length > 0 && splitsListed(splitsLoad, units) && (
        <p className="muted">{splitsView === 'laps' ? TIMING_NOTE_LAPS : TIMING_NOTE}</p>
      )}
      {!counts && <p className="muted">{INDOOR_NOTE}</p>}
      {anyGraded && <GradingLink />}
    </section>
  )
}
