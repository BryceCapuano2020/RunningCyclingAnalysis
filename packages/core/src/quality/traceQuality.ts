import type { Activity, QualityReport } from '../types'
import { assessQuality } from './assess'

/** The assessment's masks that a recorded trace carries: the streams a zone is cut from. */
export type TraceQuality = Pick<QualityReport, 'validMotion' | 'validPower' | 'validHeartRate'>

/*
 * An import digests an activity and then keeps its trace, so the assessment the digest already made is
 * remembered for the activity object, and the trace takes its masks instead of assessing a second time (a
 * capture takes microseconds, an assessment half a millisecond). The memory is weak: it goes with the activity.
 */
const assessed = new WeakMap<Activity, TraceQuality>()

/** Remembers an activity's assessment, as the digest made it. */
export function rememberTraceQuality(activity: Activity, quality: QualityReport): void {
  assessed.set(activity, {
    validMotion: quality.validMotion,
    validPower: quality.validPower,
    validHeartRate: quality.validHeartRate,
  })
}

/**
 * The masks of an activity's assessment: the digest's own when it was made from this activity object, else a
 * fresh assessment. No stream is masked by a disagreement of speed and distance (see assessQuality), so
 * none is looked for.
 */
export function traceQualityOf(activity: Activity): TraceQuality {
  return assessed.get(activity) ?? assessQuality(activity, [])
}
