import type { ActivitySummary } from '@rca/core/pipeline'
import { keyByContent } from '../contentKeys'
import {
  flagKindSentence,
  flagSpanText,
  listsTimesOf,
  skippedKinds,
  skippedReadingsText,
} from '../analysis/flagCopy'
import { skippedCountOf } from '../activityFigures'

/**
 * The data the app noted on this activity, grouped by kind: one line for each kind, with its count.
 * Readings left out of the figures are counted under "Skipped readings"; altitude notes stand under
 * "Data notes". Each reading's time is listed under its kind. The digest keeps the first flags, so
 * the note says when the rest are not listed.
 */
export function ActivityIssues({ activity }: { activity: ActivitySummary }) {
  const kinds = skippedKinds(activity.flagCounts)
  if (kinds.length === 0) return null
  const skipped = skippedCountOf(activity)
  const total = kinds.reduce((sum, kind) => sum + (activity.flagCounts[kind] ?? 0), 0)
  const shown = activity.flags.length
  return (
    <section className="section" aria-labelledby="activity-issues">
      <h2 id="activity-issues">{skipped > 0 ? 'Skipped readings' : 'Data notes'}</h2>
      {skipped > 0 && <p className="secondary">{skippedReadingsText(skipped)}</p>}
      <ul className="activity-page__flags">
        {kinds.map((kind) => {
          const flags = activity.flags.filter((flag) => flag.kind === kind)
          return (
            <li key={kind}>
              <p>{flagKindSentence(kind, activity.flagCounts[kind] ?? 0)}</p>
              {listsTimesOf(kind) && flags.length > 0 && (
                <ul className="activity-page__flag-times">
                  {keyByContent(flags, (flag) => `${flag.start}-${flag.end}`).map(
                    ({ key, item: flag }) => (
                      <li key={key}>{flagSpanText(flag)}</li>
                    ),
                  )}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      {shown < total && <p className="secondary">{`Showing the first ${shown} of ${total}.`}</p>}
    </section>
  )
}
