import { effortsCount } from '@rca/core/digest'
import type { Period } from '@rca/core/period'
import type { ActivitySummary, AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { HEADLINE_LABEL } from '../grades'
import { SPORT_ACTIVITY, SPORT_ORDER, SPORT_PLURAL } from '../sports'
import { headlineShortfall } from './pickHeadline'

/** The word that says an activity of this sport counts for the headline: the ones that hold a best are outdoor. */
const COUNTED: Record<Sport, string> = { run: 'outdoor', ride: 'outdoor' }

/** A sport's name for an activity, "run" or "outdoor run" where some of its activities do not count, singular or plural. */
function nounOf(activities: ActivitySummary[], sport: Sport, count: number): string {
  const qualified = activities.some((a) => a.sport === sport && !effortsCount(a))
  const [one, many] = [SPORT_ACTIVITY[sport], SPORT_PLURAL[sport]]
  const prefix = qualified ? `${COUNTED[sport]} ` : ''
  return `${prefix}${count === 1 ? one : many}`
}

/** A sport's counted activities as a phrase that matches the need rule: "3 rides", or "3 outdoor runs" where some do not count. */
export function countedPhrase(activities: ActivitySummary[], sport: Sport): string {
  const counted = activities.filter((a) => a.sport === sport && effortsCount(a)).length
  return `${counted} ${nounOf(activities, sport, counted)}`
}

/** The activities each sport still needs in the period, such as "Needs 2 more rides in this period."; null when none. */
export function needLine(
  short: Record<Sport, number>,
  period: Period | undefined,
  activities: ActivitySummary[],
): string | null {
  const parts = SPORT_ORDER.filter((sport) => short[sport] > 0).map(
    (sport) => `${short[sport]} more ${nounOf(activities, sport, short[sport])}`,
  )
  if (parts.length === 0) return null
  // All time names no period; a dated one is the period on screen.
  return `Needs ${parts.join(' and ')}${period === undefined || period.days === null ? '' : ' in this period'}.`
}

/** What a sport lacking an effort of the headline's length needs. */
const NEEDS_EFFORT = `A hard ${HEADLINE_LABEL} run or ride would let them be compared.`

/**
 * Why the headline is held, as the sentence that says what is missing: too few activities in the period, or no
 * effort of the headline's length in a sport. The activities come first, since an effort cannot be asked of a
 * sport with too little on file. For a headline that is held; one with enough of both says the effort.
 */
export function heldReason(result: AnalysisResult, period: Period | undefined): string {
  return needLine(headlineShortfall(result.activities), period, result.activities) ?? NEEDS_EFFORT
}
