import { withViewerZone, type Zone } from './calendar'
import { dayOf } from './customRange'
import type { LiftSet } from './lift/types'
import { liftResultsOf } from './lift/liftResults'
import type { PeriodChoice } from './period'
import { checkInSnapshotOf } from './sessionCheckIn'
import { AnalysisSession } from './session'
import { toSnapshot, type SnapshotMeta, type StateSnapshot } from './stateSnapshot'
import type { ActivityDigest, AthleteSettings } from './types'

/** Everything a snapshot is a function of: the digests, the settings, the choice, the instant and the zone. */
export interface SnapshotInput extends SnapshotMeta {
  digests: ActivityDigest[]
  settings: AthleteSettings
  choice?: PeriodChoice
  /**
   * The account's lift sets (the rows `rca-lifts` and `lift_sets` hold). The lift results are read from them, at the body mass
   * and year of birth in `settings`, on the local day of `nowMs`. Absent is a log with no sets.
   */
  liftSets?: readonly LiftSet[]
  /** The viewer's zone as a function; `zone` in the snapshot is its name. */
  viewerZone: Zone
}

/**
 * The snapshot of a library on a clock, in a zone: the same `AnalysisSession.loadDigests` the browser's worker calls, run on
 * a session of its own that is given the zone and reads no other. The server's job calls this once for each account.
 */
export function computeSnapshot(input: SnapshotInput): StateSnapshot {
  // Scoped for the whole call, the snapshot's own reads included, and synchronous: another account's compute never sees this zone.
  return withViewerZone(input.viewerZone, () => snapshotIn(input))
}

function snapshotIn(input: SnapshotInput): StateSnapshot {
  const session = new AnalysisSession(undefined, input.viewerZone)
  session.clock = () => input.nowMs
  session.choosePeriod(input.choice)
  const state = session.loadDigests(input.digests, input.settings)
  const { libraryVersion, nowMs, zone, buildSha } = input
  const checkIn =
    input.digests.length === 0 ? null : checkInSnapshotOf(input.digests, state, input.nowMs)
  const lift = liftResultsOf(input.liftSets ?? [], input.settings, dayOf(input.nowMs))
  return toSnapshot(state, { libraryVersion, nowMs, zone, buildSha }, { lift, checkIn })
}
