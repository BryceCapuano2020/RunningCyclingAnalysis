import type { ActivityDigest, DigestCurvePoint } from '../types'
import { effortsCount } from './effortTrust'

/**
 * What counts as a reading, in one place: the curves' bests (`bestCurves`) and the change test's readings
 * (`readingsOf`) both take their efforts through it, so the test is calibrated on the very efforts the numbers it
 * judges are made of. Two levels: whether an activity's efforts can hold a best at all, and whether one of its curve
 * points counts. A rule that needs the athlete's reference heart rate is made from it with a key that says what it
 * was made from. The hard-effort rule (`hardEffortRule`) is the change test's only: the curves' bests keep every
 * effort, so a demonstrated best that was not hard still shows as one.
 */
export interface ReadingRule {
  /** Whether an activity's efforts can hold a reading at all. */
  activity: (digest: ActivityDigest) => boolean
  /** Whether one point of an activity's curve counts. */
  point: (digest: ActivityDigest, point: DigestCurvePoint) => boolean
}

/** Every effort of an activity that can hold a best counts: a treadmill run's does not (see effortsCount). */
export const EVERY_EFFORT: ReadingRule = {
  activity: effortsCount,
  point: () => true,
}

/** A rule with the string that says what it was made from, so a cached result is found only for the same rule. */
export interface KeyedReadingRule {
  rule: ReadingRule
  key: string
}

export const EVERY_EFFORT_KEYED: KeyedReadingRule = { rule: EVERY_EFFORT, key: 'every' }
