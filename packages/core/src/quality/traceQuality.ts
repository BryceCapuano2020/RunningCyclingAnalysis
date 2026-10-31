import type { Activity, QualityReport } from '../types'

/**
 * What a trace carries of an activity's assessment: the masks of the streams a zone is cut from, and the
 * speed the digest cuts pace zones from when that is not the activity's own (lowered where speed and
 * distance disagree).
 */
export interface TraceQuality extends Pick<
  QualityReport,
  'validMotion' | 'validPower' | 'validHeartRate'
> {
  agreedSpeed?: Float64Array
}

/*
 * An import digests an activity and then keeps its trace, so the assessment the digest already made is
 * remembered for the activity object, and the trace takes its masks instead of assessing a second time (a
 * capture takes microseconds, an assessment half a millisecond). The memory is weak: it goes with the activity.
 */
const assessed = new WeakMap<Activity, TraceQuality>()

/** Remembers an activity's assessment, as the digest made it, with the speed the digest read. */
export function rememberTraceQuality(
  activity: Activity,
  quality: QualityReport,
  digestSpeed: Float64Array,
): void {
  assessed.set(activity, {
    validMotion: quality.validMotion,
    validPower: quality.validPower,
    validHeartRate: quality.validHeartRate,
    ...(digestSpeed === activity.speed ? {} : { agreedSpeed: digestSpeed }),
  })
}

/** The assessment the digest of this activity object made, or undefined when it has not been digested. */
export function rememberedTraceQuality(activity: Activity): TraceQuality | undefined {
  return assessed.get(activity)
}
