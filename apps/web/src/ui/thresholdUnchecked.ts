import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { uncheckedWords } from './effortWords'

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
