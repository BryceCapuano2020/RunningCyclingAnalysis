import type {
  ActivityDigest,
  DerivedStreams,
  DigestDistanceBest,
  QualityFlag,
  QualityKind,
  Sport,
} from '../types'

/** One activity as the library lists it: its identity, its headline numbers and its data issues. */
export interface ActivitySummary {
  id: string
  name: string
  sport: Sport
  startMs: number
  /** Elapsed seconds, pauses included. */
  durationS: number
  distanceM: number
  elevationGainM: number
  hasHeartRate: boolean
  indoor: boolean
  powerSource: DerivedStreams['powerSource']
  /** The first quality flags of the activity; `flagCounts` has the true number of each kind. */
  flags: QualityFlag[]
  flagCounts: Partial<Record<QualityKind, number>>
  /** Runs only, and absent for digests from before the field. See ActivityDigest.distanceBests. */
  distanceBests?: DigestDistanceBest[]
  /** Seconds recording, and absent for digests from before the field. See ActivityDigest.movingS. */
  movingS?: number
  avgHeartRate?: number | null
  maxHeartRate: number | null
  avgPowerW?: number | null
  /** The file the activity came from, when that file holds more than one activity: a session's legs share it. */
  sessionKey?: string
}

/** The library-list view of a digest. It carries distanceBests when the digest has them. */
export function summaryOf(digest: ActivityDigest): ActivitySummary {
  return {
    id: digest.id,
    name: digest.name,
    sport: digest.sport,
    startMs: digest.startMs,
    durationS: digest.durationS,
    distanceM: digest.distanceM,
    elevationGainM: digest.elevationGainM,
    hasHeartRate: digest.hasHeartRate,
    indoor: digest.indoor,
    powerSource: digest.powerSource,
    flags: digest.flags,
    flagCounts: digest.flagCounts,
    maxHeartRate: digest.maxHeartRate,
    ...(digest.distanceBests === undefined ? {} : { distanceBests: digest.distanceBests }),
    ...(digest.movingS === undefined ? {} : { movingS: digest.movingS }),
    ...(digest.avgHeartRate === undefined ? {} : { avgHeartRate: digest.avgHeartRate }),
    ...(digest.avgPowerW === undefined ? {} : { avgPowerW: digest.avgPowerW }),
    ...(digest.sessionKey === undefined ? {} : { sessionKey: digest.sessionKey }),
  }
}
