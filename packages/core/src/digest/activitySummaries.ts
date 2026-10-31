import type { ActivityDigest, AthleteSettings } from '../types'
import { orderedFor } from './consumers'
import { massesOf } from './masses'
import { powerCheckOf } from './powerCheck'
import { powerHeartRateOf } from './powerEvidence'
import { summaryOf } from './summary'
import type { ActivitySummary } from './summary'

/**
 * The activities of a library as summaries, newest first, as the analysis lists them. With dated body
 * masses each summary also carries the mass in effect on its date, which prices its W/kg.
 */
export function activitySummaries(
  digests: ActivityDigest[],
  settings?: AthleteSettings,
  rideReferenceHr: number | null = null,
): ActivitySummary[] {
  const masses = settings === undefined ? null : massesOf(settings)
  const dated = masses !== null && masses.dated
  return orderedFor('listing', digests)
    .map((digest) => {
      const summary = summaryOf(digest, dated ? masses.bodyKg(digest) : undefined)
      const check = masses === null ? undefined : powerCheckOf(digest, masses)
      // A flagged ride gets its own copy; the cached summary is shared and stays as it is.
      if (check === undefined || masses === null) return summary
      const heart = powerHeartRateOf(digest, masses.bodyKg(digest), rideReferenceHr)
      return Object.assign(
        {},
        summary,
        { powerCheck: check },
        heart === undefined ? {} : { powerHeartRate: heart },
      )
    })
    .sort((a, b) => b.startMs - a.startMs)
}
