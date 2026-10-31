import { DURATIONS_S } from '../constants'
import type { Occupancy } from '../curves'
import { meanMaximal, monotoneEnvelope } from '../curves'
import type { HeartRateSource } from '../effort'
import { windowHeartRate } from '../effort'
import { averageBlocks } from '../hr'
import { MIN_RUN_SPEED_MS } from '../metabolic'
import type { CurvePoint, DigestCurvePoint, DigestHrBlock, QualityReport } from '../types'

/** A curve point together with the length of the window its value came from. */
type WindowedPoint = CurvePoint & { windowS: number }

/**
 * Masks grade-dependent samples whose grade is unknown (NaN). Paused and stationary samples are
 * exempt because runMetabolicPower assigns them resting cost, independent of grade.
 */
export function withKnownGrade(
  quality: QualityReport,
  rawGrade: Float64Array,
  paused: Uint8Array,
  speed: Float64Array,
): QualityReport {
  const validGrade = Uint8Array.from(quality.validGrade)
  for (let i = 0; i < validGrade.length; i++) {
    const stationary = Number.isFinite(speed[i]!) && speed[i]! < MIN_RUN_SPEED_MS
    if (Number.isNaN(rawGrade[i]!) && paused[i] !== 1 && !stationary) validGrade[i] = 0
  }
  return { ...quality, validGrade }
}

/**
 * Best window at every duration, among windows that are mostly moving, then the monotone envelope.
 * A value copied from a longer window keeps that window's startIndex and windowS, so every field
 * describes the same window.
 */
export function windowedEnvelope(
  values: Float64Array,
  valid: Uint8Array,
  activityId: string,
  occupancy: Occupancy,
): WindowedPoint[] {
  // meanMaximal returns fresh points, so each one can take the window field in place.
  const windows = meanMaximal(values, valid, DURATIONS_S, activityId, { occupancy }).map((p) =>
    Object.assign(p, { windowS: p.durationS }),
  )
  return monotoneEnvelope(windows)
}

export function valueCurve(
  values: Float64Array,
  valid: Uint8Array,
  source: HeartRateSource,
  occupancy: Occupancy,
): DigestCurvePoint[] {
  return windowedEnvelope(values, valid, source.activity.id, occupancy).map((w) => ({
    durationS: w.durationS,
    value: w.value,
    startIndex: w.startIndex,
    windowS: w.windowS,
    heartRate: windowHeartRate(source, w.startIndex, w.windowS),
    terms: null,
  }))
}

export function valueBlocks(
  values: Float64Array,
  valid: Uint8Array,
  source: HeartRateSource,
): DigestHrBlock[] {
  if (!source.activity.hasHeartRate) return []
  const blocks = averageBlocks([values], source.activity.heartRate, valid, source.validHeartRate)
  return blocks.map((b) => ({ heartRate: b.heartRate, value: b.means[0]!, terms: null }))
}
