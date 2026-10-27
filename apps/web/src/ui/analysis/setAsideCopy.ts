import { HR_SET_ASIDE_FLOOR, HR_SET_ASIDE_MIN_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { formatDuration, formatPercent } from '@rca/core/units'
import { formatCount } from '../format/count'
import { SPORT_ORDER } from '../sports'

/*
 * Heart rate the analysis sets aside, in words: on the activity it came from, and once on How sure is
 * this?. The rule is the core's: a best effort held at or above threshold with heart rate too low.
 */

/** Why heart rate is set aside, the same on both pages. */
const RULE =
  `through ${formatDuration(HR_SET_ASIDE_MIN_S)} or more at or above your threshold, its heart rate ` +
  `stayed under ${formatPercent(HR_SET_ASIDE_FLOOR)} of your reference heart rate or read too low for ` +
  'the power, which a working sensor would not show'

/** The note on an activity whose heart rate is set aside. */
export const SET_ASIDE_ACTIVITY_TEXT = `We left this activity's heart rate out of the heart-rate check and the effort checks: ${RULE}.`

/** The line on How sure is this?, or null when nothing is set aside. */
export function setAsideText(result: AnalysisResult): string | null {
  const ids = new Set(result.heartRateSetAside)
  if (ids.size === 0) return null
  const counts: Record<Sport, number> = { run: 0, ride: 0 }
  for (const activity of result.activities) if (ids.has(activity.id)) counts[activity.sport]++
  const counted = SPORT_ORDER.filter((sport) => counts[sport] > 0).map(
    (sport) => `${formatCount(counts[sport])} ${counts[sport] === 1 ? sport : `${sport}s`}`,
  )
  return `Heart rate from ${counted.join(' and ')} is left out: on each, ${RULE}.`
}
