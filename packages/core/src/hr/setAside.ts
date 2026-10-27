import { HR_SET_ASIDE_FLOOR, HR_SET_ASIDE_MIN_S } from '../constants'
import type { ActivityDigest, DigestCurvePoint, Sport } from '../types'

export interface SetAsideInput {
  /** Each sport's threshold, in the unit valueOf returns; null leaves that sport's heart rate alone. */
  threshold: Record<Sport, number | null>
  /** Each sport's reference heart rate, bpm; null leaves that sport's heart rate alone. */
  referenceHr: Record<Sport, number | null>
  /** A curve point's value in its sport's threshold unit; NaN when it cannot be priced. */
  valueOf: (digest: ActivityDigest, point: DigestCurvePoint) => number
}

/**
 * Whether an activity's effort figures are measured: a ride's estimated watts or a treadmill run's
 * pace can be what is wrong, so heart rate is never judged against them.
 */
const MEASURED_EFFORT: Record<Sport, (digest: ActivityDigest) => boolean> = {
  run: (digest) => !digest.indoor,
  ride: (digest) => digest.powerSource === 'measured',
}

/**
 * Whether one best effort shows heart rate that cannot be right: held for at least
 * HR_SET_ASIDE_MIN_S at or above threshold, with heart rate either under HR_SET_ASIDE_FLOOR of the
 * reference or unknown because the readings were flagged as too low for the power.
 */
function impossibleAt(
  digest: ActivityDigest,
  point: DigestCurvePoint,
  input: SetAsideInput,
): boolean {
  const threshold = input.threshold[digest.sport]
  const reference = input.referenceHr[digest.sport]
  if (threshold === null || reference === null) return false
  if (point.durationS < HR_SET_ASIDE_MIN_S || point.startIndex < 0) return false
  if (!(input.valueOf(digest, point) >= threshold)) return false
  if (point.heartRate === null) return (digest.flagCounts['hr-implausible-for-power'] ?? 0) > 0
  return point.heartRate < HR_SET_ASIDE_FLOOR * reference
}

/**
 * The ids of the activities whose heart rate is set aside, because one of their best efforts shows
 * heart rate that a working sensor would not.
 */
export function heartRateSetAside(digests: ActivityDigest[], input: SetAsideInput): Set<string> {
  const ids = new Set<string>()
  for (const digest of digests) {
    if (!digest.hasHeartRate || !MEASURED_EFFORT[digest.sport](digest)) continue
    if (digest.curve.some((point) => impossibleAt(digest, point, input))) ids.add(digest.id)
  }
  return ids
}
