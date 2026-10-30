import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { EFFORT_TEXT, notHardWords, uncheckedWords } from './effortWords'
import { formatDuration } from '@rca/core/units'
import { refusalOf } from './records'

/**
 * Why a threshold the fit could draw is not shown, and what would give it: the line under the held best that
 * stands in its place. The best 20 minutes is the effort the fit has to reach. With a reference that can be trusted a
 * harder effort is the answer; with one that cannot (too low, too near a typical day, far above the age band) it is not:
 * the reference is what has to be set or earned. Null when the threshold was not withheld for its effort.
 */
export function thresholdWithheldLine(result: AnalysisResult, sport: Sport): string | null {
  if (refusalOf(result, sport) !== 'effort') return null
  const words = notHardWords(sport, result.effortGate[sport], 'give a threshold')
  const lead = words.reference
    ? `Your best ${EFFORT_TEXT} cannot be called a hard effort: `
    : `Your best ${EFFORT_TEXT} was not a hard effort: `
  return `${lead}${words.why}. ${words.action}`
}

/**
 * The name of the figure shown in place of a threshold withheld for its effort: the best the sport has held, "Best 30 min
 * pace", since it is a demonstrated effort and not an estimate of one. Null when the threshold was not withheld for its effort.
 */
export function heldBestHeading(result: AnalysisResult, sport: Sport): string | null {
  const floor = result.effortGate[sport].floor
  if (refusalOf(result, sport) !== 'effort' || floor === null) return null
  return `Best ${formatDuration(floor.durationS)} ${HELD_BEST_NOUN[sport]}`
}

/** What a held best is of: a pace or a power. */
const HELD_BEST_NOUN: Record<Sport, string> = { run: 'pace', ride: 'power' }

/**
 * The line for a threshold that was shown but whose effort was not checked: no heart rate on the best 20 minutes, or too
 * few days with heart rate to set a reference. Null when it was checked, or there is nothing to say.
 */
export function thresholdUncheckedLine(result: AnalysisResult, sport: Sport): string | null {
  const gate = result.effortGate[sport]
  if (gate.verdict !== 'unknown') return null
  const words = uncheckedWords(sport, gate)
  return words === null ? null : `${words.why} ${words.action}`
}
