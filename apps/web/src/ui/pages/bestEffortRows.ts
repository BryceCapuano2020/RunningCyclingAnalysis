import type { ChangeEvidence } from '@rca/core/change/types'
import { verdictAt } from '@rca/core/change/types'
import type { SportCurves } from '@rca/core/digest'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Curve, Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { recordGradeCell } from '../components/recordGrade'
import { distanceGrade, listedGradeNotes, sportGrade } from '../grades'
import type { AgeProfile, GradeOutcome } from '../grades'
import { recordChange } from '../recordChange'
import { recordRow } from '../recordRow'
import type { RecordRow } from '../recordRow'
import {
  calendarDaysBetween,
  distanceRecords,
  effortLabel,
  isEstimatedRecord,
  nativeCurve,
  paceIsTime,
  sportRecords,
  valueAt,
} from '../records'
import type { SportRecord } from '../records'

/** What a sport's best-effort list is made from. */
export interface BestEffortInput {
  sport: Sport
  result: AnalysisResult
  /** The best efforts of the period before the selected one, or null for all time. */
  previous: SportCurves | null
  /** The label of that period, such as "Previous 6 weeks". */
  previousLabel: string | null
  /** Whether each best differs from that period's by more than chance; null for all time. */
  change: ChangeEvidence | null
  massKg: number
  units: UnitSystem
  /** The grades' age and sex, or null while either is missing. */
  profile: AgeProfile | null
  /** Every visible activity, whatever the period: the earlier period's activities are looked up here. */
  library: ActivitySummary[]
  /** The time the page was opened at, which a record's age counts from. */
  openedAt: number
}

/** The sport's best-effort curve for the period, and for the one before when there is one. */
export function curvesOf({
  sport,
  result,
  previous,
  previousLabel,
}: Pick<BestEffortInput, 'sport' | 'result' | 'previous' | 'previousLabel'>): {
  current: Curve
  earlier: Curve | null
} {
  return {
    current: nativeCurve(sport, result),
    earlier: previous && previousLabel ? nativeCurve(sport, previous) : null,
  }
}

/** Days from the day the page opened to the day an activity was done, or null without an activity. */
function setDaysOf(activity: ActivitySummary | null, openedAt: number): number | null {
  return activity === null ? null : calendarDaysBetween(activity.startMs, openedAt)
}

/** A run distance's row label in sentence case, such as "Half marathon" from its record name. */
function rowLabel(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Whether a sport's own number depends on the athlete's weight: a ride's watts do, a run's pace does not. */
const WEIGHT_MATTERS: Record<Sport, boolean> = { run: false, ride: true }

/**
 * How a record moved on the period before, or null. A change is named only between two demonstrated
 * figures: a ride's estimated watts on either side leave it out, since two estimates moving is not a
 * change in the rider. With dated weights the two rides were ridden at different weights, so the earlier
 * figure is first brought to the weight of the newer ride, and the change is one in watts per kilogram.
 */
function changeOf(
  record: SportRecord,
  input: BestEffortInput,
  { current, earlier }: ReturnType<typeof curvesOf>,
): string | null {
  const { sport, previousLabel, units, library } = input
  if (!earlier || !previousLabel) return null
  if (isEstimatedRecord(sport, record.activity)) return null
  // The activity behind the earlier period's best at a duration, found in the library.
  const earlierId =
    earlier.find((point) => point.durationS === record.durationS)?.activityId ?? null
  const earlierActivity =
    earlierId === null ? null : (library.find((activity) => activity.id === earlierId) ?? null)
  if (isEstimatedRecord(sport, earlierActivity)) return null
  const [newerKg, olderKg] = [record.activity?.massKg, earlierActivity?.massKg]
  const atNewerWeight =
    WEIGHT_MATTERS[sport] && newerKg !== undefined && olderKg !== undefined && newerKg !== olderKg
      ? newerKg / olderKg
      : 1
  return recordChange(
    sport,
    valueAt(current, record.durationS),
    valueAt(earlier, record.durationS) * atNewerWeight,
    units,
    previousLabel,
    verdictAt(input.change, sport, record.durationS),
  )
}

/** The rows of a run's distance bests, each graded at the age on the day it was run. */
function distanceRowsOf(input: BestEffortInput): {
  rows: RecordRow[]
  partial: boolean
  outcomes: (GradeOutcome | null)[]
} {
  const { sport, result, units, profile, openedAt } = input
  const distance = sport === 'run' ? distanceRecords(result.activities, units) : null
  const records = distance?.records ?? []
  const outcomes = records.map((record) =>
    profile === null
      ? null
      : distanceGrade(record.distanceM, record.seconds, record.activity.startMs, profile),
  )
  const rows = records.map((record, index) => ({
    key: `distance-${record.distanceM}`,
    label: rowLabel(record.label),
    value: record.time,
    sub: paceIsTime(record.distanceM, units) ? null : record.pace,
    // A distance best is the run's own pace, not a flat pace, so it carries no Flat mark.
    grade: recordGradeCell(sport, outcomes[index] ?? null, null, 'row'),
    tags: [],
    change: null,
    setDays: setDaysOf(record.activity, openedAt),
    activity: record.activity,
  }))
  return { rows, partial: distance?.partial ?? false, outcomes }
}

/** The best-effort list's rows and the notes under it. */
export interface BestEffortRows {
  /** The duration rows, then the distance rows. */
  rows: RecordRow[]
  /** How many of the rows are distance bests, which a note under the list explains. */
  distanceCount: number
  listNotes: string[]
  /** Whether some record's watts are estimated, which a ride's note says. */
  someEstimated: boolean
  /** Whether runs added before distance bests were recorded may be hiding faster ones. */
  partial: boolean
}

/** One sport's best-effort list from its records, graded where the age and sex are given. */
export function bestEffortRows(input: BestEffortInput): BestEffortRows {
  const { sport, result, massKg, units, profile, openedAt } = input
  const records = sportRecords(result, sport, massKg, units)
  const graded = records.map((record) => ({
    record,
    // Each record is graded at the age on the date of its own effort.
    outcome: profile === null ? null : sportGrade(result, sport, record.durationS, profile),
  }))
  const distance = distanceRowsOf(input)
  const curves = curvesOf(input)
  // The list says a ride's lead and a run's no-standard gap once under it, so each row leaves them off.
  const durationRows = graded.map(({ record, outcome }) =>
    recordRow(sport, record, {
      label: effortLabel(record.durationS),
      grade: recordGradeCell(sport, outcome, record.covered, 'row'),
      change: changeOf(record, input, curves),
      setDays: setDaysOf(record.activity, openedAt),
    }),
  )
  return {
    rows: [...durationRows, ...distance.rows],
    distanceCount: distance.rows.length,
    listNotes: listedGradeNotes(sport, [
      ...graded.map(({ outcome }) => outcome),
      ...distance.outcomes,
    ]),
    someEstimated: records.some((record) => isEstimatedRecord(sport, record.activity)),
    partial: distance.partial,
  }
}
