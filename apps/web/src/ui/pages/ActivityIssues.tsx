import type { ActivitySummary } from '@rca/core/pipeline'
import { formatCount } from '../format/count'
import { flagKindRow, flagSpanText, listsTimesOf, skippedKinds } from '../analysis/flagCopy'
import { skippedCountOf } from '../activityFigures'
import { PropertyList } from '../components/PropertyList'
import type { Property } from '../components/property'
import { SECTION_ID } from '../components/methodTopics'

/**
 * The data the app noted on this activity, behind a disclosure, as a detail panel's rows. The timeline above already marks
 * where readings were left out, so this is the evidence: one row for each kind with its count, then a row for each reading
 * with its time. Readings left out of the figures are counted under "Skipped readings"; altitude notes stand under "Data
 * notes". The digest keeps the first flags, so a row says when the rest are not listed. Heart rate the analysis set aside is
 * noted last; why is on Method.
 */
export function ActivityIssues({
  activity,
  setAside = false,
}: {
  activity: ActivitySummary
  /** Whether this activity's heart rate is set aside. */
  setAside?: boolean
}) {
  const kinds = skippedKinds(activity.flagCounts)
  if (kinds.length === 0 && !setAside) return null
  const skipped = skippedCountOf(activity)
  const total = kinds.reduce((sum, kind) => sum + (activity.flagCounts[kind] ?? 0), 0)
  const shown = activity.flags.length
  const notes = kinds.length + (setAside ? 1 : 0)
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
  return (
    <section className="section" aria-labelledby="activity-issues">
      <h2 id="activity-issues">{skipped > 0 ? 'Skipped readings' : 'Data notes'}</h2>
      <details className="activity-page__notes">
        <summary>{notes === 1 ? 'Show the note' : `Show the ${notes} notes`}</summary>
        <PropertyList rows={rows} method={SECTION_ID.how} methodName="how readings are checked" />
      </details>
    </section>
  )
}
