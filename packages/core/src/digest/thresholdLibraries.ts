import { memoByDigests } from '../digestMemo'
import type { MaxHeartRates } from '../effort'
import type { ThresholdEstimate, ThresholdLine } from '../threshold'
import { SPORTS } from '../types'
import type { ActivityDigest, BikeModel, Sport } from '../types'
import type { EstimatedRideGate } from './estimatedRide'
import type { Masses } from './masses'
import { runsOf } from './runEfforts'
import { libraryOf, ridesOf, thresholdOf } from './thresholdEfforts'
import type { ActivityEfforts, ThresholdLibrary } from './thresholdEfforts'

/** What pricing a sport's efforts needs besides the digests: only rides read the masses, the bike model and the gate. */
export interface EffortInputs {
  masses: Masses
  bikeModel: BikeModel
  gate: EstimatedRideGate | null
  /** The activities whose heart rate is set aside: their efforts carry none and they give no blocks. */
  heartSetAside: ReadonlySet<string>
}

/**
 * Whether a sport's threshold reads heart rate. A run's does not, for now: on a real library the heart-rate lift read a run
 * threshold far over the pace-only answer, which was right (docs/design/threshold.md, "Runs"). The code path is the same for
 * both sports, so turning one on is its entry here.
 */
const READS_HEART_RATE: Record<Sport, boolean> = { run: false, ride: true }

/**
 * The reference maximum a sport's threshold heart rate is drawn from (`thresholdHeartRate`): the sport's own, or null where its
 * threshold reads no heart rate, which then has no line and no heart-rate estimate.
 */
export function thresholdReferenceOf(sport: Sport, referenceHr: MaxHeartRates): number | null {
  return READS_HEART_RATE[sport] ? referenceHr[sport] : null
}

/** How each sport reads its activities into efforts. */
const ACTIVITIES_OF: Record<
  Sport,
  (ordered: ActivityDigest[], inputs: EffortInputs) => ActivityEfforts[]
> = {
  run: (ordered, { heartSetAside }) => runsOf(ordered, heartSetAside),
  ride: (ordered, { masses, bikeModel, gate, heartSetAside }) =>
    ridesOf(ordered, masses, bikeModel, gate, heartSetAside),
}

export const eachSport = <T>(of: (sport: Sport) => T): Record<Sport, T> =>
  Object.fromEntries(SPORTS.map((sport) => [sport, of(sport)])) as Record<Sport, T>

/**
 * A library's activities of each sport, read once, and the heart-rate line fitted over each sport's (none for a sport whose
 * threshold reads no heart rate or has no reference heart rate in `referenceHr`): what its periods and its zone windows all read.
 */
export function librariesOf(
  ordered: ActivityDigest[],
  inputs: EffortInputs,
  referenceHr: MaxHeartRates,
): Record<Sport, ThresholdLibrary> {
  return eachSport((sport) =>
    sport === 'run' && !READS_HEART_RATE.run
      ? runLibrary(ordered, inputs.heartSetAside)
      : libraryOf(
          ACTIVITIES_OF[sport](ordered, inputs),
          ordered,
          thresholdReferenceOf(sport, referenceHr),
        ),
  )
}

const sameMembers = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean =>
  a === b || (a.size === b.size && [...a].every((id) => b.has(id)))

/**
 * The runs' library while a run's threshold reads no heart rate: a run is priced from its pace alone, so it reads no body mass,
 * bike model or ride gate, and no reference heart rate. It is kept for the last digests asked for, so a change of body mass, or
 * anything else that only rides read, takes the library already read (and the threshold timeline its steps, by the same object).
 */
const runLibrary = memoByDigests(
  (ordered: ActivityDigest[], heartSetAside: ReadonlySet<string>) =>
    libraryOf(runsOf(ordered, heartSetAside), ordered, null),
  sameMembers,
  undefined,
  2,
)

/**
 * Each sport's threshold over a set of digests (`thresholdOf`), read against `lines` (the library's, one per sport; absent, a
 * sport's is fitted over this set's activities, and none for a sport that reads no heart rate), with the heart rate of the sports
 * that read it.
 */
export function thresholdsOf(
  ordered: ActivityDigest[],
  inputs: EffortInputs,
  referenceHr: MaxHeartRates,
  lines?: Record<Sport, ThresholdLine>,
): Record<Sport, ThresholdEstimate | null> {
  return eachSport((sport) =>
    thresholdOf(
      ACTIVITIES_OF[sport](ordered, inputs),
      ordered,
      thresholdReferenceOf(sport, referenceHr),
      lines?.[sport],
    ),
  )
}
