import type { Sport } from '@rca/core/types'
import { FITNESS_WORDS } from '../fitnessWords'

/** The section's name, in its heading. */
export const SAME_HEART_RATE_NAME = 'Same heart rate, week by week'

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
    ? `${drawn} Your fitness status above uses ${words.steadyPlural} over longer stretches.`
    : drawn
}
