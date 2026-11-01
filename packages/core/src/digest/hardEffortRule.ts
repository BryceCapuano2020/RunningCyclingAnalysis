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
 * Whether an effort of `lengthS` seconds in an activity was a hard effort, by the heart rate it was held at. Up to 20
 * minutes it is the session's peak (the late-best session test); beyond it the session's average, since a steady effort
 * of an hour or more sits at 80% to 90% of the maximum, not at the hard line (the endurance test of a race prediction).
 * `unknown` without a heart rate, with it set aside, or against a reference too thin to judge; `notHard` against a
 * reference that cannot certify a maximum. A best that is not a curve point (a run's time over a distance) is judged here.
 */
export function effortVerdict(
  digest: ActivityDigest,
  lengthS: number,
  reference: EffortReference,
  setAside: ReadonlySet<string>,
): PointVerdict {
  if (lengthS <= SPRINT_S) return 'free'
  if (setAside.has(digest.id)) return 'unknown'
  const bpm = reference.referenceHr[digest.sport]
  const reading = reference.reading[digest.sport]
  if (lengthS <= HEADLINE_DURATION_S) return sessionVerdict(digest, bpm, reading)
  const average = digest.avgHeartRate
  if (typeof average !== 'number' || bpm === null || !(bpm > 0) || reading === null) {
    return 'unknown'
  }
  if (reading === 'thin') return 'unknown'
  return reading === 'trusted' && average / bpm >= ENDURANCE_AVERAGE_SHARE ? 'hard' : 'notHard'
}

/** Whether one point of an activity's curve was a hard effort (see `effortVerdict`), at its duration. */
export function pointVerdict(
  digest: ActivityDigest,
  point: DigestCurvePoint,
  reference: EffortReference,
  setAside: ReadonlySet<string>,
): PointVerdict {
  return effortVerdict(digest, point.durationS, reference, setAside)
}

/**
 * Whether heart rate shows a point was not a hard effort, against a reference that can say so: a reference that is trusted
 * and a point held under the hard line. A point heart rate cannot judge (none, set aside, a thin library) or a reference that
 * cannot certify a maximum shows nothing, so it is not shown to be easy: the gate withholds only what it can see was not hard.
 */
export function shownNotHard(
  digest: ActivityDigest,
  point: DigestCurvePoint,
  reference: EffortReference,
  setAside: ReadonlySet<string>,
): boolean {
  return (
    reference.reading[digest.sport] === 'trusted' &&
    pointVerdict(digest, point, reference, setAside) === 'notHard'
  )
}

/**
 * What a reading rule does with a point heart rate cannot judge. The change test needs evidence that an effort was hard, so it
 * leaves such a point out (`hard`); the bests-over-time dots withhold only what heart rate shows was not hard, so such a
 * point stays (`unlessShownEasy`). One function builds both, so the two cannot differ in anything else.
 */
export type GateMode = 'hard' | 'unlessShownEasy'

/**
 * The reading rule behind the effort gate. In `hard` mode a point counts when heart rate shows it was a hard effort, or
 * cannot judge it because it is a sprint; a point that was not hard, or whose heart rate is missing, does not. In
 * `unlessShownEasy` mode a point counts unless heart rate shows it was not hard (`shownNotHard`): a point with no heart
 * rate, one set aside, one in a thin library, or against a reference that cannot certify a maximum is not shown easy, so
 * it stays.
 */
function gatedRule(
  reference: EffortReference,
  setAside: readonly string[],
  mode: GateMode,
): KeyedReadingRule {
  const aside = new Set(setAside)
  const point =
    mode === 'hard'
      ? (digest: ActivityDigest, each: DigestCurvePoint) => {
          const verdict = pointVerdict(digest, each, reference, aside)
          return verdict === 'hard' || verdict === 'free'
        }
      : (digest: ActivityDigest, each: DigestCurvePoint) =>
          !shownNotHard(digest, each, reference, aside)
  const name = mode === 'hard' ? 'hard2' : 'dots1'
  return {
    rule: { activity: effortsCount, point },
    key: `${name}|${JSON.stringify([reference.referenceHr, reference.reading])}|${setAside.join(',')}`,
  }
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
  return gatedRule(reference, setAside, 'hard')
}

/**
 * The reading rule of the bests-over-time dots: every effort counts but one heart rate shows was not hard, so a dot is an
 * effort that led its window and was hard, or could not be judged. An effort with no heart rate stays (D5 counts it): the
 * gate withholds only what it can see was not hard. A week whose window holds only efforts shown easy has no dot. The
 * curves' bests keep every effort, as the change test's ungated reading does; only the dots are gated.
 */
export function dotsRule(
  reference: EffortReference,
  setAside: readonly string[],
): KeyedReadingRule {
  return gatedRule(reference, setAside, 'unlessShownEasy')
}
