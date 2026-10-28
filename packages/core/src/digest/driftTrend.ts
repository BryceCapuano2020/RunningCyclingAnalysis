import type { ActivityDigest, Sport } from '../types'

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
}

/** The drift of every steady effort of one sport among the digests, earliest first. */
export function driftTrend(digests: ActivityDigest[], sport: Sport): DriftPoint[] {
  const points: DriftPoint[] = []
  for (const digest of digests) {
    const { drift } = digest
    if (digest.sport !== sport || drift === undefined || drift === null) continue
    points.push({
      activityId: digest.id,
      startMs: digest.startMs,
      firstRatio: drift.firstRatio,
      secondRatio: drift.secondRatio,
      durationS: drift.durationS,
      decouplingPct: (100 * (drift.firstRatio - drift.secondRatio)) / drift.firstRatio,
    })
  }
  return points.sort((a, b) => a.startMs - b.startMs || (a.activityId < b.activityId ? -1 : 1))
}
