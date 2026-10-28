import type {
  ActivityDigest,
  PowerSource,
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
  powerSource: PowerSource
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
  /** The body mass in effect on its date, kg. Present only when the athlete has dated body masses. */
  massKg?: number
}

// A digest is never changed once it is held, so its summary is made once. The period's activities and
// the library list then hold the same objects, and a structured clone sends each of them once.
const summaries = new WeakMap<ActivityDigest, ActivitySummary>()

/** The library-list view of a digest. It carries distanceBests when the digest has them. */
export function summaryOf(digest: ActivityDigest, massKg?: number): ActivitySummary {
  let summary = summaries.get(digest)
  // The body mass is the athlete's, not the digest's, so a summary made for another mass is made again.
  if (summary === undefined || summary.massKg !== massKg) {
    summary = summaryFrom(digest, massKg)
    summaries.set(digest, summary)
  }
  return summary
}

function summaryFrom(digest: ActivityDigest, massKg: number | undefined): ActivitySummary {
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
    ...(massKg === undefined ? {} : { massKg }),
  }
}
