import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { UnitSystem } from '@rca/core/units'
import { GradingLink } from '../components/GradingLink'
import { SportRecords } from '../components/SportRecords'
import { WeightNote } from '../components/WeightNote'
import { recordGradeCell } from '../components/recordGrade'
import { periodDates } from '../components/rangeOptions'
import { splitsShowFlatNote, type SplitsLoad } from '../components/splitRows'
import { FLAT_PACE_NOTE, distanceGrade, listedGradeNotes, sportGrade } from '../grades'
import type { AgeProfile } from '../grades'
import { FLAT_MARK, recordRow, treadmillMarks } from '../recordRow'
import type { RecordRow } from '../recordRow'
import {
  effortLabel,
  isEstimatedRecord,
  ownDistanceRecords,
  paceIsTime,
  sportRecords,
} from '../records'

export interface ActivityBestsProps {
  activity: ActivitySummary
  /** The result the period's bests come from. */
  result: AnalysisResult
  units: UnitSystem
  massKg: number
  /** False while no body weight is entered: a ride's bests wait for it, as the cards hold them. */
  weightKnown: boolean
  profile: AgeProfile | null
  /** Whether the activity is in the period the result covers. Outside it, its bests are not counted. */
  inPeriod: boolean
  period?: Period
  /** The run's splits as the page holds them, which say where the flat pace note goes. */
  splitsLoad: SplitsLoad
}

/** Why a ride without measured power has no power curve, as the page says it. */
const NO_POWER_CURVE: Record<'virtual' | 'none', string> = {
  virtual: 'No power curve: an estimate is made only on climbs.',
  none: 'No power curve: this ride has no power data.',
}

/**
 * Whether the best efforts carry the flat pace note. The splits carry it when they show a flat pace
 * column, so it sits there and not here. Otherwise, when a best carries a Flat mark it explains, it sits
 * here. It waits for the splits to settle, so it is never placed in two places at once.
 */
function flatNoteHere(
  sport: ActivitySummary['sport'],
  splitsLoad: SplitsLoad,
  units: UnitSystem,
  rows: readonly RecordRow[],
): boolean {
  if (sport !== 'run' || splitsLoad.status === 'loading') return false
  return !splitsShowFlatNote(splitsLoad, units) && rows.some((row) => row.tags.includes(FLAT_MARK))
}

function outsideText(period: Period | undefined): string {
  return period === undefined
    ? 'Outside the period you chose, so its best efforts are not counted.'
    : `Outside ${periodDates(period)}, so its best efforts are not counted.`
}

/**
 * The best efforts this activity set, as one records list: the library's bests it holds, then the run
 * distances it has its own time at. Each is graded at its own date and linked to How is this graded?.
 * The list says nothing when it has no best, so an activity without one is not told it has none.
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
  splitsLoad,
}: ActivityBestsProps) {
  const sport = activity.sport
  if (!inPeriod) {
    return (
      <section className="section" aria-labelledby="activity-bests">
        <h2 id="activity-bests">Best efforts set here</h2>
        <p className="secondary">{outsideText(period)}</p>
      </section>
    )
  }
  const bests = sportRecords(result, sport, massKg, units).filter(
    (record) => record.activity?.id === activity.id,
  )
  const distances = ownDistanceRecords(activity, units)
  if (bests.length === 0 && distances.length === 0) {
    // A ride with no measured power has no power curve, and the page says why rather than leaving it out.
    const reason =
      activity.powerSource !== 'measured' && isEstimatedRecord(sport, activity)
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
      profile === null
        ? null
        : distanceGrade(record.distanceM, record.seconds, activity.startMs, profile),
  }))
  const outcomes = [...durationItems, ...distanceItems].map((item) => item.outcome)
  const anyGraded = outcomes.some((outcome) => outcome?.kind === 'graded')
  // The list says a ride's lead and a run's no-standard gap once under it, so each row leaves them off.
  const listNotes = listedGradeNotes(sport, outcomes)
  // The page is the activity, so its rows name no activity of their own.
  const rows: RecordRow[] = [
    ...durationItems.map(({ record, outcome }) => {
      const row = recordRow(sport, record, {
        label: `Best ${effortLabel(record.durationS)}`,
        grade: recordGradeCell(sport, outcome, record.covered, 'row'),
      })
      row.activity = null
      return row
    }),
    ...distanceItems.map(({ record, outcome }): RecordRow => ({
      key: `distance-${record.distanceM}`,
      label: `Best ${record.label}`,
      value: record.time,
      // In miles the mile, and in kilometres the kilometre, is its own time, so it has no pace to show.
      sub: paceIsTime(record.distanceM, units) ? null : record.pace,
      grade: recordGradeCell(sport, outcome, null, 'row'),
      tags: treadmillMarks(sport, activity),
      change: null,
      setDays: null,
      activity: null,
    })),
  ]
  return (
    <section className="section" aria-labelledby="activity-bests">
      <h2 id="activity-bests">Best efforts set here</h2>
      <SportRecords rows={rows} />
      {listNotes.map((note) => (
        <p key={note} className="muted">
          {note}
        </p>
      ))}
      {flatNoteHere(sport, splitsLoad, units, rows) && <p className="muted">{FLAT_PACE_NOTE}</p>}
      {anyGraded && <GradingLink />}
    </section>
  )
}
