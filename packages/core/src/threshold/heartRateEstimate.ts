import {
  GAP_SD_SHARE,
  HALF_LIFE_DAYS,
  HR_EFFORT_S,
  HR_EFFORT_SHARE,
  LINE_GAP_SD_SHARE,
  LINE_SD,
  MIN_SPREAD_BPM,
  READING_SD_BPM,
  REFERENCE_ERROR,
  RESIDUAL_CAP_BPM,
} from './constants'
import { fitHeartRateLine, valueAt, type HeartRateLine } from './heartRateLine'
import { robustMean } from './robustMean'
import type { HeartRateRefusal, ThresholdBlock, ThresholdEffort } from './types'

export interface HeartRateEstimate {
  value: number
  /** Relative error, including the reference maximum's, which never averages away. */
  relativeError: number
  /** How many efforts it was built from. */
  efforts: number
}

/** The weight of an effort that sits `distance` bpm off its ride's line: 1 on it, 0 at the cap (4 spreads, at most 12 bpm). */
function lineQuality(distance: number, spread: number): number {
  const u = distance / Math.min(4 * Math.max(spread, MIN_SPREAD_BPM), RESIDUAL_CAP_BPM)
  return Math.abs(u) >= 1 ? 0 : (1 - u * u) ** 2
}

/**
 * Slides each steady effort along the rider's own line to threshold heart rate: `value + (thresholdHr - hr) / slope`. Only
 * measured efforts of 8 to 30 min count (shorter lags, longer drifts), from rides the line kept, at 85 to 102% of threshold
 * heart rate and within 12 bpm of their own ride's line. An effort far from threshold is trusted less, in proportion to
 * the distance it is extrapolated over. The line's own value at threshold heart rate joins them, trusted less the further
 * threshold heart rate lies above the highest block.
 */
function effortEstimates(
  line: HeartRateLine,
  efforts: readonly ThresholdEffort[],
  thresholdHr: number,
): { value: number; weight: number }[] {
  const points: { value: number; weight: number }[] = []
  for (const e of efforts) {
    if (e.heartRate === null || e.estimated || line.excluded.has(e.activityId)) continue
    if (!(e.durationS >= HR_EFFORT_S[0] && e.durationS <= HR_EFFORT_S[1])) continue
    const share = e.heartRate / thresholdHr
    if (!(share >= HR_EFFORT_SHARE[0] && share <= HR_EFFORT_SHARE[1])) continue
    const own = line.offsets.get(e.activityId) ?? line.offset
    const quality = lineQuality(e.heartRate - (own + line.slope * e.value), line.spread)
    if (quality === 0) continue
    const gap = thresholdHr - e.heartRate
    const value = e.value + gap / line.slope
    const sd =
      Math.hypot(READING_SD_BPM / line.slope, (GAP_SD_SHARE * Math.abs(gap)) / line.slope) / value
    const recency = 0.5 ** (Math.max(0, e.ageDays) / HALF_LIFE_DAYS)
    points.push({ value, weight: (quality * recency) / sd ** 2 })
  }
  return points
}

/**
 * What heart rate says the threshold is: `power` is the power estimate the line's block band is set from, `thresholdHr` the
 * heart rate at threshold (the caller's 90% of the sport's reference maximum). Returns the first guard that stopped it where
 * it could not say.
 */
export function heartRateEstimate(
  efforts: readonly ThresholdEffort[],
  blocks: readonly ThresholdBlock[],
  thresholdHr: number | null,
  power: number,
): HeartRateEstimate | { refused: HeartRateRefusal } {
  if (thresholdHr === null || !(thresholdHr > 0) || blocks.length === 0) {
    return { refused: 'no-heart-rate' }
  }
  const line = fitHeartRateLine(blocks, power)
  if ('refused' in line) return line
  const points = effortEstimates(line, efforts, thresholdHr)
  if (points.length === 0) return { refused: 'no-efforts' }
  const used = points.length
  const atThreshold = valueAt(line, thresholdHr)
  if (atThreshold > 0) {
    const gap = Math.max(0, thresholdHr - line.highest)
    const sd = Math.hypot(LINE_SD, (LINE_GAP_SD_SHARE * gap) / line.slope / atThreshold)
    points.push({ value: atThreshold, weight: 1 / sd ** 2 })
  }
  const mean = robustMean(points)
  if (mean === null) return { refused: 'no-efforts' }
  return {
    value: mean.value,
    relativeError: Math.hypot(mean.relativeError, REFERENCE_ERROR),
    efforts: used,
  }
}
