import { MIN_CLIMB_GRADE } from '../constants'
import { rollingMean } from '../math'

const CLIMB_GRADE_WINDOW_SAMPLES = 30
const MIN_CLIMB_SPEED_MS = 1

/**
 * 1 where the 30-sample centred mean gradient is at least minGrade and the rider
 * is moving faster than 1 m/s, else 0.
 */
export function climbMask(
  grade: Float64Array,
  speed: Float64Array,
  minGrade = MIN_CLIMB_GRADE,
): Uint8Array {
  const gradeMean = rollingMean(grade, CLIMB_GRADE_WINDOW_SAMPLES)
  const out = new Uint8Array(gradeMean.length)
  for (let i = 0; i < out.length; i++) {
    const steep = gradeMean[i]! >= minGrade
    const moving = speed[i]! > MIN_CLIMB_SPEED_MS
    out[i] = steep && moving ? 1 : 0
  }
  return out
}

/** Maximal runs of non-zero samples at least minLengthS long. End is exclusive. */
export function findSegments(mask: Uint8Array, minLengthS = 120): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  let start = -1
  for (let i = 0; i <= mask.length; i++) {
    const on = i < mask.length && mask[i]! !== 0
    if (on && start < 0) {
      start = i
    } else if (!on && start >= 0) {
      if (i - start >= minLengthS) out.push({ start, end: i })
      start = -1
    }
  }
  return out
}
