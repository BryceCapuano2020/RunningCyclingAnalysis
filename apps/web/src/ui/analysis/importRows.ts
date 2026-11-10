import { localYearOf } from '@rca/core/calendar'
import { formatDayMonth, formatMonth } from '../format/date'
import { plural } from '../components/plural'
import type { Property } from '../components/property'
import { notAddedSentence } from './copy'
import type { ImportCounts } from './copy'

/** What an import added, label over value: the runs and rides, and the dates they span. Nothing when it added none. */
function addedRows(summary: ImportCounts, nowMs: number): Property[] {
  const { runs = 0, rides = 0, firstStartMs, lastStartMs } = summary
  if (runs + rides === 0 || firstStartMs === undefined || lastStartMs === undefined) return []
  const counts = [runs > 0 ? plural(runs, 'run') : '', rides > 0 ? plural(rides, 'ride') : '']
    .filter((text) => text !== '')
    .join(' and ')
  // One activity has one day; a span names its months, with the year when either end is not this year.
  if (runs + rides === 1) {
    return [
      { label: 'Added', value: counts },
      { label: 'Date', value: formatDayMonth(firstStartMs, nowMs) },
    ]
  }
  const firstYear = localYearOf(firstStartMs)
  const withYear = firstYear !== localYearOf(lastStartMs) || firstYear !== localYearOf(nowMs)
  const first = formatMonth(firstStartMs, withYear)
  const last = formatMonth(lastStartMs, withYear)
  return [
    { label: 'Added', value: counts },
    { label: 'Dates', value: first === last ? first : `${first} to ${last}` },
  ]
}

/**
 * The summary of an import as rows, label over value: what it added and when they were, what it updated, the detail it
 * restored and the activities its list labelled and left out. An import that added and updated nothing has no rows and
 * a sentence instead (`rowsOrSentence`).
 */
export function importRows(summary: ImportCounts, nowMs = Date.now()): Property[] {
  const { updatedRuns = 0, updatedRides = 0, detailRestored = 0, labelled = 0 } = summary
  const updated = [
    updatedRuns > 0 ? plural(updatedRuns, 'run') : '',
    updatedRides > 0 ? plural(updatedRides, 'ride') : '',
  ].filter((text) => text !== '')
  return [
    ...addedRows(summary, nowMs),
    ...(updated.length > 0 ? [{ label: 'Updated', value: updated.join(' and ') }] : []),
    ...(detailRestored > 0
      ? [{ label: 'Detail restored', value: plural(detailRestored, 'activity', 'activities') }]
      : []),
    ...(labelled > 0
      ? [{ label: 'Labelled, now left out', value: plural(labelled, 'activity', 'activities') }]
      : []),
  ]
}

/** The rows of an import, or the one sentence that says it brought nothing new. */
export function rowsOrSentence(
  summary: ImportCounts,
  nowMs = Date.now(),
): { rows: Property[]; sentence: string | null } {
  const rows = importRows(summary, nowMs)
  return rows.length > 0
    ? { rows, sentence: null }
    : { rows, sentence: notAddedSentence(summary.activities) }
}
