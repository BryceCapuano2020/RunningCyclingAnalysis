import type { ReactNode } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { isEstimatedRecord } from './records'
import type { SportRecord } from './records'

/** One best effort as a row of a records list, whichever page or card lists it. */
export interface RecordRow {
  key: string
  /** The duration the record names, such as "20 min" or "Best 1 km". */
  label: string
  /** The figure in the sport's own unit, such as "4:00 /km" or "250 W". */
  value: string
  /** A second reading beside the figure, such as W/kg. */
  sub: string | null
  /** The grade beside the figure, or a short gap line in its place; null when neither applies. */
  grade: ReactNode
  /** Short marks beside the figure, each with its meaning in words elsewhere: "Flat", "Estimated". */
  tags: string[]
  /** How the record moved on the period before, in words, or null without one. */
  change?: string | null
  /** The activity that set the record, or null when it is not in the result. */
  activity: ActivitySummary | null
}

/**
 * One best-effort record as a row. A run's pace is a flat pace, so it is marked Flat; a ride's
 * watts are marked estimated unless they were measured by a power meter.
 */
export function recordRow(
  sport: Sport,
  record: SportRecord,
  options: { label: string; grade: ReactNode; change?: string | null },
): RecordRow {
  const tags =
    sport === 'run' ? ['Flat'] : isEstimatedRecord(sport, record.activity) ? ['Estimated'] : []
  return {
    key: String(record.durationS),
    label: options.label,
    value: record.value,
    sub: record.sub,
    grade: options.grade,
    tags,
    change: options.change ?? null,
    activity: record.activity,
  }
}
