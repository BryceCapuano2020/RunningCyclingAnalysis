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

/** Whether a flag that heart rate looked too low for the power covers part of the window. */
function flaggedLowIn(digest: ActivityDigest, point: DigestCurvePoint): boolean {
  const end = point.startIndex + point.windowS
  return digest.flags.some(
    (flag) =>
      flag.kind === 'hr-implausible-for-power' && flag.start < end && flag.end > point.startIndex,
  )
}

/**
 * One best effort's heart rate as a share of the reference, when the effort was held for at least
 * HR_SET_ASIDE_MIN_S at or above threshold; null otherwise, or when its heart rate is unknown for
 * any other reason. Readings flagged as too low for the power through it count as a share of 0.
 */
function shareAt(digest: ActivityDigest, point: DigestCurvePoint, input: SetAsideInput) {
  const threshold = input.threshold[digest.sport]
  const reference = input.referenceHr[digest.sport]
  if (threshold === null || reference === null) return null
  if (point.durationS < HR_SET_ASIDE_MIN_S || point.startIndex < 0) return null
  if (!(input.valueOf(digest, point) >= threshold)) return null
  if (point.heartRate === null) return flaggedLowIn(digest, point) ? 0 : null
  return point.heartRate / reference
}

/** The lowest share over an activity's hard best efforts, or null when none can be judged. */
function lowestShare(digest: ActivityDigest, input: SetAsideInput): number | null {
  if (!digest.hasHeartRate || !MEASURED_EFFORT[digest.sport](digest)) return null
  let lowest: number | null = null
  for (const point of digest.curve) {
    const share = shareAt(digest, point, input)
    if (share !== null && (lowest === null || share < lowest)) lowest = share
  }
  return lowest
}

/**
 * The ids of the activities whose heart rate a working sensor would not show: a best effort held
 * at or above threshold with heart rate under HR_SET_ASIDE_FLOOR of the reference, or flagged as too
 * low for the power through it.
 */
export function heartRateSetAside(digests: ActivityDigest[], input: SetAsideInput): Set<string> {
  const ids = new Set<string>()
  for (const digest of digests) {
    const share = lowestShare(digest, input)
    if (share !== null && share < HR_SET_ASIDE_FLOOR) ids.add(digest.id)
  }
  return ids
}

/**
 * The one activity whose heart rate is furthest below the floor, by its lowest share and then its
 * id, or null when none is below it. Setting aside one at a time lets the references be retaken
 * before the next is judged.
 */
export function worstSetAside(digests: ActivityDigest[], input: SetAsideInput): string | null {
  let worst: { id: string; share: number } | null = null
  for (const digest of digests) {
    const share = lowestShare(digest, input)
    if (share === null || share >= HR_SET_ASIDE_FLOOR) continue
    if (worst === null || share < worst.share || (share === worst.share && digest.id < worst.id)) {
      worst = { id: digest.id, share }
    }
  }
  return worst?.id ?? null
}
