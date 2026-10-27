import { CP_FIT_MAX_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { fitRestsOnEstimate } from './thresholdRange'

/** The hard effort's activity, as the note says it: a run is "running", a ride is "riding". */
const ACTIVITY_ING: Record<Sport, string> = { run: 'running', ride: 'riding' }

/** Said under a ride's floor when its fit draws on estimated watts. */
const ESTIMATE_LINE = ' The top end uses estimated watts.'

/** The durations as a list in words, such as "15 min and 20 min". */
function durationList(seconds: number[]): string {
  const names = seconds.map((s) => formatDuration(s))
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * The line under a threshold's range when the sport has an uneven fit: why the top of the range is only a
 * floor, and, for a ride whose fit draws on estimated watts, that the top end uses them. Null without one.
 */
export function unevenNote(result: AnalysisResult, sport: Sport): string | null {
  const uneven = { run: result.runCpUneven, ride: result.rideCpUneven }[sport]
  if (!uneven) return null
  const floor = `Your best ${durationList(uneven.leftOutS)} each held a shorter hard effort with easier ${ACTIVITY_ING[sport]} around it, so they only set a floor. A steady all-out ${formatDuration(CP_FIT_MAX_S)} would narrow this.`
  const estimate = { run: '', ride: fitRestsOnEstimate(result) ? ESTIMATE_LINE : '' }[sport]
  return `${floor}${estimate}`
}
