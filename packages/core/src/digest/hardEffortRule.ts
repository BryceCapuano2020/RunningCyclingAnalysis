import { HEADLINE_DURATION_S } from '../constants'
import { ENDURANCE_AVERAGE_SHARE, sessionVerdict } from '../effort'
import type { EffortReference } from '../effort'
import type { ActivityDigest, DigestCurvePoint } from '../types'
import { effortsCount } from './effortTrust'
import type { KeyedReadingRule } from './readingRule'

/**
 * Efforts this short or shorter are not judged by heart rate: the heart rate that is kept is a 30 s mean and trails an
 * effort, so a sprint inside an easy ride never shows in it. They count in the gated reading.
 */
export const SPRINT_S = 60

/** How a point of an activity stands against the effort gate. `free` is a point heart rate cannot judge (a sprint). */
export type PointVerdict = 'hard' | 'notHard' | 'unknown' | 'free'

/**
 * Whether one point of an activity's curve was a hard effort, by the heart rate it was held at. Up to 20 minutes it is the
 * session's peak (the late-best session test); beyond it the session's average, since a steady effort of an hour or more
 * sits at 80% to 90% of the maximum, not at the hard line (the endurance test of a race prediction). `unknown` without a
 * heart rate, with it set aside, or against a reference too thin to judge; `notHard` against a reference that cannot
 * certify a maximum.
 */
export function pointVerdict(
  digest: ActivityDigest,
  point: DigestCurvePoint,
  reference: EffortReference,
  setAside: ReadonlySet<string>,
): PointVerdict {
  if (point.durationS <= SPRINT_S) return 'free'
  if (setAside.has(digest.id)) return 'unknown'
  const bpm = reference.referenceHr[digest.sport]
  const reading = reference.reading[digest.sport]
  if (point.durationS <= HEADLINE_DURATION_S) return sessionVerdict(digest, bpm, reading)
  const average = digest.avgHeartRate
  if (typeof average !== 'number' || bpm === null || !(bpm > 0) || reading === null) {
    return 'unknown'
  }
  if (reading === 'thin') return 'unknown'
  return reading === 'trusted' && average / bpm >= ENDURANCE_AVERAGE_SHARE ? 'hard' : 'notHard'
}

/**
 * The reading rule the change test's gated reading takes: a point counts when heart rate shows it was a hard effort, or
 * cannot judge it because it is a sprint. A point that was not hard, or whose heart rate is missing, does not count. The
 * test makes a call from this reading only when both periods hold enough of it, and otherwise from every effort in both
 * (see `changeEvidence`), so the two periods are always read alike: a strap worn in one period alone cannot swing the
 * hard share of one side.
 *
 * Only the test reads through it. The bests the pages show are the curves' own, every effort, so a demonstrated best
 * that was not hard still shows as a best; the strip withholds a comparison whose shown best was not hard.
 */
export function hardEffortRule(
  reference: EffortReference,
  setAside: readonly string[],
): KeyedReadingRule {
  const aside = new Set(setAside)
  return {
    rule: {
      activity: effortsCount,
      point: (digest, point) => {
        const verdict = pointVerdict(digest, point, reference, aside)
        return verdict === 'hard' || verdict === 'free'
      },
    },
    key: `hard2|${JSON.stringify([reference.referenceHr, reference.reading])}|${setAside.join(',')}`,
  }
}
