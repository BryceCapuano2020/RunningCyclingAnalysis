import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { fitRestsOnEstimate } from './thresholdRange'

/** Said under a ride's floor when its fit draws on estimated watts. */
const ESTIMATE_LINE = ' The top end uses estimated watts.'

/** The durations as a list in words, such as "15 min and 20 min". */
function durationList(seconds: number[]): string {
  const names = seconds.map((s) => formatDuration(s))
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * The line under a threshold's range when the sport has an uneven fit: which bests mixed hard and easy, and, for a
 * ride whose fit draws on estimated watts, that the top end uses them. Null without one.
 */
export function unevenNote(result: AnalysisResult, sport: Sport): string | null {
  const uneven = { run: result.runCpUneven, ride: result.rideCpUneven }[sport]
  if (!uneven) return null
  const wide = `Best ${durationList(uneven.leftOutS)} mixed hard and easy.`
  const estimate = { run: '', ride: fitRestsOnEstimate(result) ? ESTIMATE_LINE : '' }[sport]
  return `${wide}${estimate}`
}
