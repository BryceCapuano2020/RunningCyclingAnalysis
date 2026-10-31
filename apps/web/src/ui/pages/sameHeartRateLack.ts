import type { SameHeartRate } from '@rca/core/digest'
import type { Sport } from '@rca/core/types'
import { FITNESS_WORDS } from '../fitnessWords'
import { sameHeartRateLackText } from '../sameHeartRateCopy'
import { lackLine } from './lackLine'

/** The section's name, in its heading and in the page's "Not enough yet" list. */
export const SAME_HEART_RATE_NAME = 'Same heart rate, week by week'

/** Why there is no reading to draw, as a "Not enough yet" line, or null when there is a chart. */
export function sameHeartRateLack(sport: Sport, data: SameHeartRate): string | null {
  const text = sameHeartRateLackText(sport, data)
  return text === null ? null : lackLine(SAME_HEART_RATE_NAME, text)
}

/**
 * What the closed row says: what is drawn. It names no change. A sport with a fitness status says where that is,
 * so the weekly view never speaks for the same runs in another voice.
 */
export function weeklyFinding(
  sport: Sport,
  referenceHr: number | null,
  statusSpeaks: boolean,
): string {
  const words = FITNESS_WORDS[sport]
  const drawn = `Your ${words.output.toLowerCase()} each week${referenceHr === null ? '' : ` at ${referenceHr} bpm`}.`
  return statusSpeaks
    ? `${drawn} Your fitness status above is read from ${words.steadyPlural} over longer stretches.`
    : drawn
}
