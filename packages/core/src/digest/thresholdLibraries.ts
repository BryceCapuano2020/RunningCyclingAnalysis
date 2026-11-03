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
 * A library's activities of each sport, read once, and the heart-rate line fitted over each sport's (none for a sport with no
 * reference heart rate in `referenceHr`): what its periods and its zone windows all read.
 */
export function librariesOf(
  ordered: ActivityDigest[],
  inputs: EffortInputs,
  referenceHr: MaxHeartRates,
): Record<Sport, ThresholdLibrary> {
  return eachSport((sport) =>
    libraryOf(ACTIVITIES_OF[sport](ordered, inputs), ordered, referenceHr[sport]),
  )
}

/**
 * Each sport's threshold over a set of digests (`thresholdOf`), read against `lines` (the library's, one per sport; absent, a
 * sport's is fitted over this set's activities).
 */
export function thresholdsOf(
  ordered: ActivityDigest[],
  inputs: EffortInputs,
  referenceHr: MaxHeartRates,
  lines?: Record<Sport, ThresholdLine>,
): Record<Sport, ThresholdEstimate | null> {
  return eachSport((sport) =>
    thresholdOf(ACTIVITIES_OF[sport](ordered, inputs), ordered, referenceHr[sport], lines?.[sport]),
  )
}
