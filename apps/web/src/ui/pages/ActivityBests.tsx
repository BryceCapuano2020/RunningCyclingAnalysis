import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Period } from '@rca/core/period'
import type { UnitSystem } from '@rca/core/units'
import { GradingLink } from '../components/GradingLink'
import { SportRecords } from '../components/SportRecords'
import { WeightNote } from '../components/WeightNote'
import { recordGradeCell } from '../components/recordGrade'
import { periodDates } from '../components/rangeOptions'
import { FLAT_PACE_NOTE, distanceGrade, sportGrade } from '../grades'
import type { AgeProfile } from '../grades'
import type { RecordRow } from '../recordRow'
import { recordRow } from '../recordRow'
import { ownDistanceRecords, recordDurationLabel, sportRecords } from '../records'

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
}

/** Why a ride without measured power has no power curve, as the page says it. */
const NO_POWER_CURVE: Record<'virtual' | 'none', string> = {
  virtual:
    'No power curve: power on this ride is estimated, and an estimate is made only on climbs.',
  none: 'No power curve: this ride has no power data.',
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
      profile === null
        ? null
        : distanceGrade(record.distanceM, record.seconds, activity.startMs, profile),
  }))
  const anyGraded = [...durationItems, ...distanceItems].some(
    (item) => item.outcome?.kind === 'graded',
  )
  // The page is the activity, so its rows name no activity of their own.
  const rows: RecordRow[] = [
    ...durationItems.map(({ record, outcome }) => {
      const row = recordRow(sport, record, {
        label: `Best ${recordDurationLabel(record.durationS)}`,
        grade: recordGradeCell(sport, outcome),
      })
      row.activity = null
      return row
    }),
    ...distanceItems.map(({ record, outcome }): RecordRow => ({
      key: `distance-${record.distanceM}`,
      label: `Best ${record.label}`,
      value: record.time,
      sub: record.pace,
      grade: recordGradeCell(sport, outcome),
      tags: [],
      change: null,
      activity: null,
    })),
  ]
  return (
    <section className="section" aria-labelledby="activity-bests">
      <h2 id="activity-bests">Best efforts set here</h2>
      <SportRecords rows={rows} />
      {sport === 'run' && <p className="muted">{FLAT_PACE_NOTE}</p>}
      {anyGraded && <GradingLink />}
    </section>
  )
}
