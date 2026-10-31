import type { ActivityDigest, Sport } from '../types'
import { effortsCount } from './effortTrust'

/** One steady effort's drift: how far output per heart rate fell between its halves. */
export interface DriftPoint {
  activityId: string
  startMs: number
  firstRatio: number
  secondRatio: number
  /** Moving seconds the two halves cover. */
  durationS: number
  /** (first - second) / first, in percent. Positive means the second half cost more heart rate for the same output. */
  decouplingPct: number
  /** The effort's average heart rate over the sport's reference heart rate: its ruler. Null when either is unknown. */
  share?: number | null
}

/** The drift of every steady effort of one sport among the digests, earliest first. */
export function driftTrend(
  digests: ActivityDigest[],
  sport: Sport,
  referenceBpm: number | null = null,
): DriftPoint[] {
  const points: DriftPoint[] = []
  for (const digest of digests) {
    const { drift } = digest
    if (digest.sport !== sport || !effortsCount(digest)) continue
    if (drift === undefined || drift === null) continue
    points.push({
      activityId: digest.id,
      startMs: digest.startMs,
      firstRatio: drift.firstRatio,
      secondRatio: drift.secondRatio,
      durationS: drift.durationS,
      decouplingPct: (100 * (drift.firstRatio - drift.secondRatio)) / drift.firstRatio,
      share:
        referenceBpm !== null && referenceBpm > 0 && typeof digest.avgHeartRate === 'number'
          ? digest.avgHeartRate / referenceBpm
          : null,
    })
  }
  return points.sort((a, b) => a.startMs - b.startMs || (a.activityId < b.activityId ? -1 : 1))
}
