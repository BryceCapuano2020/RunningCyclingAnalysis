import { HEADLINE_DURATION_S, THRESHOLD_HOLD_S } from '../constants'
import type { ActivityDigest, Curve } from '../types'
import type { ThresholdFloor } from './thresholdTimelineTypes'

/**
 * The floor a sport's best curve gives: its best 30 minutes, else its best 20, with the day of the activity that set it.
 * A best is a floor whether or not it was hard, so this reads the curve as it stands; null when the curve holds neither.
 */
export function thresholdFloorOf(
  curve: Curve,
  digests: readonly Pick<ActivityDigest, 'id' | 'startMs'>[],
): ThresholdFloor | null {
  for (const durationS of [THRESHOLD_HOLD_S, HEADLINE_DURATION_S]) {
    const point = curve.find((each) => each.durationS === durationS)
    if (point === undefined || !(point.value > 0) || !Number.isFinite(point.value)) continue
    const from = digests.find((digest) => digest.id === point.activityId)
    if (from !== undefined) return { durationS, value: point.value, asOfMs: from.startMs }
  }
  return null
}
