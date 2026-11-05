import type { ReactNode } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { SportRecord } from './records'

/** The mark a run's pace carries, as a GAP: its word on a row, with its meaning one press away. */
export const GAP_MARK = 'GAP'

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
   * Short marks beside the figure: "GAP" with its meaning one press away, and the scope marks a page adds.
   */
  tags: string[]
  /** How the record moved on the period before, in words, or null without one. */
  change?: string | null
  /** Days from the day the page opened to the day the record was set, or null when that is not known. */
  setDays: number | null
  /** The activity that set the record, or null when it is not in the result. */
  activity: ActivitySummary | null
}

/** One best-effort record as a row. A run's pace is a GAP, which its list says once, not on each row. */
export function recordRow(
  record: SportRecord,
  options: {
    label: string
    grade: ReactNode
    change?: string | null
    tags?: string[]
    setDays?: number | null
  },
): RecordRow {
  return {
    key: String(record.durationS),
    label: options.label,
    value: record.value,
    sub: record.sub,
    grade: options.grade,
    tags: options.tags ?? [],
    change: options.change ?? null,
    setDays: options.setDays ?? null,
    activity: record.activity,
  }
}
