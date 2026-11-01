import type { AnalysisResult } from '@rca/core/pipeline'
import { SPORT_ACTIVITY, SPORT_NOUN, SPORT_ORDER } from '../sports'
import { hasEvidence } from './pickHeadline'

/**
 * The one line under a balance that says what it rests on when a best 20 min was not shown to be a hard effort: a best that
 * was not all-out is a floor, so the sport's real level is at least this. Null when every best was shown hard or was not
 * checked (`uncheckedNote` says that). The balance is stated either way; this is its label, not a condition of it.
 * A third discipline adds its own wording where more than two bests can be short.
 */
export function basisLine(result: AnalysisResult): string | null {
  const easy = SPORT_ORDER.filter(
    (sport) => hasEvidence(result, sport) && result.effortGate[sport].verdict === 'notHard',
  )
  const [only] = easy
  if (only === undefined) return null
  if (easy.length === 1) {
    return `Your ${SPORT_ACTIVITY[only]} best wasn't all-out, so ${SPORT_NOUN[only]} could be higher.`
  }
  return 'Neither best was all-out.'
}
