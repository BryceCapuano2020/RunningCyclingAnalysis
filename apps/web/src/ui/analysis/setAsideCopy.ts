import { HR_SET_ASIDE_FLOOR, HR_SET_ASIDE_MIN_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import type { Sport } from '@rca/core/types'
import { formatDuration, formatPercent } from '@rca/core/units'
import { formatCount } from '../format/count'
import { SPORT_ORDER } from '../sports'

/*
 * Heart rate the analysis sets aside, in words: on the activity it came from, and once on How sure is
 * this?. The rule is the core's: a best effort held at or above threshold with heart rate too low.
 */

/** A sport as the reference heart rate names it: the one for running, the one for cycling. */
const SPORT_REFERENCE: Record<Sport, string> = { run: 'running', ride: 'cycling' }

/**
 * Where the reference heart rate is from and what it is. Whose heart rate is set aside is judged once, over every
 * activity, so the reference is the library's; the page's own figure for a period can differ, and the line says
 * which it is so the two cannot seem to disagree. Empty when the judgement holds no reference for the sports.
 */
function libraryReference(sports: readonly Sport[], judgement: HeartRateJudgement): string {
  const named = sports.flatMap((sport) => {
    const bpm = judgement.referenceHr[sport]
    return bpm === null ? [] : [`${Math.round(bpm)} bpm ${SPORT_REFERENCE[sport]}`]
  })
  return named.length === 0 ? '' : ` across all your activities (${named.join(', ')})`
}

/** Why heart rate is set aside, with the reference it was judged against. */
function rule(sports: readonly Sport[], judgement: HeartRateJudgement): string {
  return (
    `through ${formatDuration(HR_SET_ASIDE_MIN_S)} or more at or above your threshold, its heart rate ` +
    `stayed under ${formatPercent(HR_SET_ASIDE_FLOOR)} of your reference heart rate` +
    `${libraryReference(sports, judgement)} or read too low for the power, through that effort or across the whole activity, which a working sensor would not show`
  )
}

/** The note on an activity whose heart rate is set aside. */
export function setAsideActivityText(sport: Sport, judgement: HeartRateJudgement): string {
  return `We left this activity's heart rate out of the heart-rate check and the effort checks: ${rule([sport], judgement)}.`
}

/** The line on How sure is this?, or null when nothing is set aside. */
export function setAsideText(result: AnalysisResult, judgement: HeartRateJudgement): string | null {
  const ids = new Set(result.heartRateSetAside)
  if (ids.size === 0) return null
  const counts: Record<Sport, number> = { run: 0, ride: 0 }
  for (const activity of result.activities) if (ids.has(activity.id)) counts[activity.sport]++
  const sports = SPORT_ORDER.filter((sport) => counts[sport] > 0)
  const counted = sports.map(
    (sport) => `${formatCount(counts[sport])} ${counts[sport] === 1 ? sport : `${sport}s`}`,
  )
  return `Heart rate from ${counted.join(' and ')} is left out: on each, ${rule(sports, judgement)}.`
}
