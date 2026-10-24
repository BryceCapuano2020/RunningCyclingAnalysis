import type {
  ActivityDigest,
  DerivedStreams,
  DigestDistanceBest,
  QualityFlag,
  Sport,
} from '../types'

/** One activity as the library lists it: its identity, its headline numbers and its data issues. */
export interface ActivitySummary {
  id: string
  name: string
  sport: Sport
  startMs: number
  durationS: number
  distanceM: number
  elevationGainM: number
  hasHeartRate: boolean
  powerSource: DerivedStreams['powerSource']
  flags: QualityFlag[]
  /** Runs only, and absent for digests from before the field. See ActivityDigest.distanceBests. */
  distanceBests?: DigestDistanceBest[]
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
    powerSource: digest.powerSource,
    flags: digest.flags,
    ...(digest.distanceBests === undefined ? {} : { distanceBests: digest.distanceBests }),
  }
}
