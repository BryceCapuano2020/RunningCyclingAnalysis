import type { ReactNode } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { isEstimatedRecord, isTreadmillRecord } from './records'
import type { SportRecord } from './records'

/** The mark a run's pace carries, as a flat pace: its word on a row, and the note that explains it. */
export const FLAT_MARK = 'Flat'

/** The marks a record's figure carries: a run's is flat, and a ride's is estimated when its watts are. */
const MARKS: Record<Sport, (activity: ActivitySummary | null) => string[]> = {
  run: () => [FLAT_MARK],
  ride: (activity) => (isEstimatedRecord('ride', activity) ? ['Estimated'] : []),
}

/** The mark a run held indoors carries, in the same chip as Estimated: its pace is a treadmill's. */
export const TREADMILL_MARK = 'Treadmill'

/** The Treadmill mark for a record that a run held indoors set, and no mark for any other record. */
export function treadmillMarks(sport: Sport, activity: ActivitySummary | null): string[] {
  return isTreadmillRecord(sport, activity) ? [TREADMILL_MARK] : []
}

/** One best effort as a row of a records list, whichever page or card lists it. */
export interface RecordRow {
  key: string
  /** The duration the record names, such as "20 min" or "1 km". */
  label: string
  /** The figure in the sport's own unit, such as "4:00 /km" or "250 W". */
  value: string
  /** A second reading beside the figure, such as W/kg. */
  sub: string | null
  /** The grade beside the figure, or a short gap line in its place; null when neither applies. */
  grade: ReactNode
  /**
   * Short marks beside the figure, each with its meaning in words elsewhere: "Flat", "Estimated",
   * "Treadmill".
   */
  tags: string[]
  /** How the record moved on the period before, in words, or null without one. */
  change?: string | null
  /** Days from the day the page opened to the day the record was set, or null when that is not known. */
  setDays: number | null
  /** The activity that set the record, or null when it is not in the result. */
  activity: ActivitySummary | null
}

/**
 * One best-effort record as a row. A run's pace is a flat pace, so it is marked Flat; a ride's
 * watts are marked estimated unless they were measured by a power meter. A run held indoors is
 * marked Treadmill as well.
 */
export function recordRow(
  sport: Sport,
  record: SportRecord,
  options: {
    label: string
    grade: ReactNode
    change?: string | null
    tags?: string[]
    setDays?: number | null
  },
): RecordRow {
  const marks = MARKS[sport](record.activity)
  return {
    key: String(record.durationS),
    label: options.label,
    value: record.value,
    sub: record.sub,
    grade: options.grade,
    tags: [...marks, ...treadmillMarks(sport, record.activity), ...(options.tags ?? [])],
    change: options.change ?? null,
    setDays: options.setDays ?? null,
    activity: record.activity,
  }
}
