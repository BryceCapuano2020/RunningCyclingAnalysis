import type { ActivitySummary } from '@rca/core/pipeline'
import { formatCount } from '../format/count'
import { flagKindRow, flagSpanText, listsTimesOf, skippedKinds } from '../analysis/flagCopy'
import { skippedCountOf } from '../activityFigures'
import { PropertyList } from '../components/PropertyList'
import type { Property } from '../components/property'
import { SECTION_ID } from '../components/methodTopics'
import { formatTotalTime } from '@rca/core/units'
import type { RecordingGaps } from './recordingGaps'

/**
 * The data the app noted on this activity, behind one disclosure named for it, as a detail panel's rows. The timeline draws a
 * left-out reading or a recording gap only as a break in its line, so this names them: one row for each kind with its count,
 * then a row for each reading with its time, and the recording gaps where the device holds the readings. Readings left out of the figures are counted under "Skipped readings"; altitude notes stand under "Data
 * notes". The digest keeps the first flags, so a row says when the rest are not listed. Heart rate the analysis set aside is
 * noted last; why is on Method.
 */
export function ActivityIssues({
  activity,
  setAside = false,
  gaps = null,
}: {
  activity: ActivitySummary
  /** Whether this activity's heart rate is set aside. */
  setAside?: boolean
  /** The stretches the device did not record, known only where this device holds the readings. */
  gaps?: RecordingGaps | null
}) {
  const kinds = skippedKinds(activity.flagCounts)
  if (kinds.length === 0 && !setAside && gaps === null) return null
  const skipped = skippedCountOf(activity)
  const total = kinds.reduce((sum, kind) => sum + (activity.flagCounts[kind] ?? 0), 0)
  const shown = activity.flags.length
  const rows: Property[] = []
  for (const kind of kinds) {
    const row = flagKindRow(kind, activity.flagCounts[kind] ?? 0, activity.indoor)
    rows.push(row)
    if (!listsTimesOf(kind)) continue
    activity.flags
      .filter((flag) => flag.kind === kind)
      .forEach((flag, n) =>
        rows.push({ label: `${row.label} ${n + 1}`, value: flagSpanText(flag) }),
      )
  }
  if (shown < total)
    rows.push({ label: 'Listed', value: `${formatCount(shown)} of ${formatCount(total)}` })
  if (setAside) rows.push({ label: 'Heart rate', value: 'Left out of the checks' })
  if (gaps !== null)
    rows.push({
      label: 'Not recorded',
      value: `${formatCount(gaps.count)} ${gaps.count === 1 ? 'stretch' : 'stretches'}, ${formatTotalTime(gaps.seconds)}`,
    })
  return (
    <details className="disclosure page-details">
      <summary>{skipped > 0 ? 'Skipped readings' : 'Data notes'}</summary>
      <div className="disclosure__body disclosure__lines">
        <PropertyList rows={rows} method={SECTION_ID.how} methodName="how readings are checked" />
      </div>
    </details>
  )
}
