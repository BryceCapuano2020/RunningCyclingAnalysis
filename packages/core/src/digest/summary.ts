import type {
  ActivityDigest,
  AthleteType,
  LocalDayShift,
  PowerSource,
  DigestDistanceBest,
  QualityFlag,
  QualityKind,
  Sport,
} from '../types'
import type { EstimatedPower } from './estimatedPower'
import type { PowerHeartRate } from './powerEvidence'

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
  /** Runs only: a run at walking pace, kept in the library and left out of the analysis. See ActivityDigest.walkingPace. */
  walkingPace?: true
  /** The export the activity came from tags it as a race. See ActivityDigest.race. */
  race?: true
  /**
   * A ride whose power no rider holds (see implausiblePower): 'set-aside' while it is left out of every best, 'kept'
   * once the athlete chose to keep it. Absent for every other activity. Set by activitySummaries, which knows the masses.
   */
  powerCheck?: 'set-aside' | 'kept'
  /**
   * For a ride with a `powerCheck` whose power is estimated from speed and climbs (no power meter): the effort that
   * needs the most power over the ceiling, and what it needs. Absent for a measured ride and for every other activity.
   */
  estimatedPower?: EstimatedPower
  /**
   * For a ride with a `powerCheck`: the heart rate over its longest effort above the ceiling, as a share of the athlete's
   * reference, when that can be read (see PowerHeartRate). Absent otherwise.
   */
  powerHeartRate?: PowerHeartRate
  /** Revision 7: the athlete's own label when it differs from the file's sport. See ActivityDigest.athleteType. */
  athleteType?: AthleteType
  /** Revision 7: the local calendar date minus the UTC date at the start. See ActivityDigest.localDayShift. */
  localDayShift?: LocalDayShift
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
    ...(digest.walkingPace === undefined ? {} : { walkingPace: digest.walkingPace }),
    ...(digest.race === undefined ? {} : { race: digest.race }),
    ...(digest.athleteType === undefined ? {} : { athleteType: digest.athleteType }),
    ...(digest.localDayShift === undefined ? {} : { localDayShift: digest.localDayShift }),
    ...(massKg === undefined ? {} : { massKg }),
  }
}
