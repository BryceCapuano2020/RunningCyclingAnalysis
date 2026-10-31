import { rememberedTraceQuality } from '../quality'
import type { TraceQuality } from '../quality/traceQuality'
import type { Activity } from '../types'
import { digestActivity } from './digestActivity'

/**
 * The assessment of an activity as its digest makes it, for the trace of the activity page. An import digests an
 * activity and then keeps its trace, so the digest has already remembered it. An activity read back from its original
 * has not been digested, and is digested now: the masks the digest takes out (a heart rate that repeats the cadence, a
 * lone power spike, the seconds a speed and distance disagree) are then the library's, and the page counts the same
 * seconds the sport page does. It is the digest's own work, not a second copy of its rules.
 */
export function traceQualityOf(activity: Activity): TraceQuality {
  const remembered = rememberedTraceQuality(activity)
  if (remembered !== undefined) return remembered
  digestActivity(activity)
  return rememberedTraceQuality(activity)!
}
