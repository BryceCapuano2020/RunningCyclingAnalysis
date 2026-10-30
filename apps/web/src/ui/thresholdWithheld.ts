import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { ReferenceReading } from '@rca/core/effort'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport } from '@rca/core/types'
import { formatDuration } from '@rca/core/units'
import { refusalOf } from './records'
import { SPORT_NOUN } from './sports'

/** The effort a withheld threshold asks for, in the words every effort is named in: "20 min". */
const NEEDED = formatDuration(HEADLINE_DURATION_S)

/** What the best 20 minutes' heart rate did show, by what the reference can certify. */
const WHY: Record<ReferenceReading, (noun: string, bpm: number | null, share: number) => string> = {
  trusted: (noun, _bpm, share) =>
    `it reached ${Math.round(share * 100)}% of your ${noun} reference heart rate`,
  low: (noun, bpm) =>
    `the highest ${noun} heart rate on file${bpm === null ? '' : `, ${Math.round(bpm)} bpm,`} is too low to be a maximum`,
  habitual: (noun) => `your ${noun} heart rate on file never rises far above a typical day's`,
}

/**
 * Why a threshold the fit could draw is not shown, and what would give it: the line under the held best that
 * stands in its place. The best 20 minutes is the effort the fit has to reach, and a share of the reference
 * heart rate says it was not hard, or the reference is too low or too near a typical day's to say so. Null when the
 * threshold was not withheld for its effort.
 */
export function thresholdWithheldLine(result: AnalysisResult, sport: Sport): string | null {
  if (refusalOf(result, sport) !== 'effort') return null
  const gate = result.effortGate[sport]
  const bpm = { run: result.runMaxHeartRate, ride: result.rideMaxHeartRate }[sport]
  const why = WHY[gate.reference ?? 'trusted'](SPORT_NOUN[sport], bpm, gate.share ?? 0)
  return `Your best ${NEEDED} was not shown to be a hard effort: ${why}. A hard ${NEEDED} effort would give a threshold.`
}
