import type { ActivitySummary } from '@rca/core/pipeline'
import { keyByContent } from '../contentKeys'
import { flagSentence, skippedReadingsText } from '../analysis/flagCopy'
import { skippedCountOf } from '../activityFigures'

/**
 * The readings the app left out of this activity's figures, each as a sentence with its clock times.
 * The digest keeps the first flags, so the note says when the rest are not listed.
 */
export function ActivityIssues({ activity }: { activity: ActivitySummary }) {
  const skipped = skippedCountOf(activity)
  if (skipped === 0) return null
  const shown = activity.flags.length
  return (
    <section className="section" aria-labelledby="activity-issues">
      <h2 id="activity-issues">Skipped readings</h2>
      <p className="secondary">{skippedReadingsText(skipped)}</p>
      <ul className="activity-page__flags">
        {keyByContent(activity.flags, (flag) => `${flag.kind}:${flag.start}-${flag.end}`).map(
          ({ key, item: flag }) => (
            <li key={key}>{flagSentence(flag)}</li>
          ),
        )}
      </ul>
      {shown < skipped && (
        <p className="secondary">{`Showing the first ${shown} of ${skipped}.`}</p>
      )}
    </section>
  )
}
