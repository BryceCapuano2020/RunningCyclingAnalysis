import { effortVerdict } from '../digest/hardEffortRule'
import { NO_EFFORT_REFERENCE } from '../effort'
import type { ActivityDigest } from '../types'
import type { HistoryInput } from './types'

/**
 * Whether heart rate shows a best of `lengthS` seconds, held in `digest`, was a hard effort: the effort gate's own test,
 * for a best that is not on a curve too (a run's time over a distance). A best that is not shown hard still counts, as a
 * floor, so the chart draws it hollow; nothing is withheld for it. A sprint is not judged by heart rate and counts hard.
 */
export function shownHard(digest: ActivityDigest, lengthS: number, input: HistoryInput): boolean {
  const verdict = effortVerdict(
    digest,
    lengthS,
    input.effortReference ?? NO_EFFORT_REFERENCE,
    input.setAside,
  )
  return verdict === 'hard' || verdict === 'free'
}
