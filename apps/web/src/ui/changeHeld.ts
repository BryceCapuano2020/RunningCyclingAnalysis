import { HEADLINE_DURATION_S } from '@rca/core/constants'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Sport, SportCurves } from '@rca/core/types'
import { effortShare } from './effortCaveat'
import { HEADLINE_LABEL } from './grades'
import { SPORT_NOUN } from './sports'

/**
 * The line that says a best was not compared, or null when it can be: neither period's best 20 minutes is known to
 * have been easy. The 90% heart-rate line is the effort gate's own; a best the gate could not judge (no heart rate on it,
 * too few days with one to set a reference) is not held, as the headline is not: nothing shows it was easy, and the
 * headline's note says the effort was not checked.
 */
export function notHardNote(
  sport: Sport,
  result: Pick<AnalysisResult, 'effort'>,
  previous: SportCurves,
  label: string,
): string | null {
  const now = effortShare(
    sport,
    result.effort.find((check) => check.durationS === HEADLINE_DURATION_S),
  )
  const before = effortShare(sport, previous.headlineEffort)
  const noun = SPORT_NOUN[sport]
  // Where the reference cannot show an effort hard, a harder effort is not what is missing: say it cannot be called hard.
  if (before !== null && before.checked && !before.hard) {
    return before.confirmed
      ? `No comparable hard ${HEADLINE_LABEL} of ${noun} in the ${label.toLowerCase()}.`
      : `No best ${HEADLINE_LABEL} of ${noun} in the ${label.toLowerCase()} can be called hard, so it is not compared.`
  }
  if (now !== null && now.checked && !now.hard) {
    return now.confirmed
      ? `Your best ${HEADLINE_LABEL} of ${noun} in this period was not a hard effort, so it is not compared.`
      : `Your best ${HEADLINE_LABEL} of ${noun} in this period cannot be called a hard effort, so it is not compared.`
  }
  return null
}
