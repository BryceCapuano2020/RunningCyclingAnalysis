import type { ActivityDigest as LiveActivityDigest } from '../../../../types'

export * from '../../../../types'

/**
 * Frozen: the quality kinds and the digest as revision 6 wrote them. A kind or a field added later is
 * not in these, so this reader is what a build before revision 7 does with a digest that has them.
 */
export type QualityKind =
  | 'hr-dropout'
  | 'hr-spike'
  | 'hr-implausible-for-power'
  | 'power-spike'
  | 'power-dropout'
  | 'speed-spike'
  | 'implausible-speed'
  | 'altitude-jump'
  | 'implausible-climb'
  | 'stream-disagreement'
  | 'missing-altitude'

export interface QualityFlag {
  kind: QualityKind
  start: number
  end: number
  message: string
}

/** The keys of a revision-6 digest. A key added to the live type is not here. */
type Rev6Key =
  | 'version'
  | 'modelRevision'
  | 'id'
  | 'name'
  | 'sport'
  | 'startMs'
  | 'durationS'
  | 'distanceM'
  | 'elevationGainM'
  | 'hasHeartRate'
  | 'indoor'
  | 'powerSource'
  | 'maxHeartRate'
  | 'curve'
  | 'hrBlocks'
  | 'calibration'
  | 'climbSections'
  | 'distanceBests'
  | 'splits'
  | 'movingS'
  | 'avgHeartRate'
  | 'avgPowerW'
  | 'sessionKey'
  | 'race'
  | 'walkingPace'
  | 'distributions'
  | 'durability'
  | 'drift'

export type ActivityDigest = Pick<LiveActivityDigest, Rev6Key> & {
  flags: QualityFlag[]
  flagCounts: Partial<Record<QualityKind, number>>
}
