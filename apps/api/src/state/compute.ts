import { analysisSettings, bodyMassOn } from '@rca/core/athlete'
import { withViewerZone } from '@rca/core/calendar'
import { computeSnapshot } from '@rca/core/stateCompute'
import type { StateSnapshot } from '@rca/core/stateSnapshot'
import { BUILD_SHA } from '../buildInfo.ts'
import type { StateInputs } from './stateInputs.ts'
import { zoneNamed } from './zone.ts'

/** The zone the days are cut in while the browser has reported none. */
export const DEFAULT_ZONE = 'UTC'

/**
 * The account's snapshot at an instant: the settings the browser would build from the same choices (`analysisSettings`,
 * the one function), then `computeSnapshot`, which runs the `AnalysisSession.loadDigests` the browser's worker runs, in
 * this account's zone and no other (decision 1, 2). The body mass is the dated one in effect at `nowMs`, as the page reads it.
 */
export function computeFor(inputs: StateInputs, nowMs: number): StateSnapshot {
  const zoneName = inputs.settings.zone ?? DEFAULT_ZONE
  const viewerZone = zoneNamed(zoneName)
  // A dated weight takes effect on its local day, so reading it needs the account's zone, not the process's.
  const massKg = withViewerZone(viewerZone, () =>
    bodyMassOn(inputs.massKg, inputs.measurements, nowMs),
  )
  const settings = analysisSettings(
    { massKg, bikeMassKg: inputs.bikeMassKg },
    inputs.measurements,
    inputs.birthYear,
    inputs.settings.countedRuns ?? [],
    inputs.settings.keepPower ?? [],
    inputs.sex,
  )
  return computeSnapshot({
    digests: inputs.digests,
    liftSets: inputs.liftSets,
    settings,
    ...(inputs.settings.period === null ? {} : { choice: inputs.settings.period }),
    libraryVersion: inputs.version,
    nowMs,
    zone: zoneName,
    buildSha: BUILD_SHA,
    viewerZone,
  })
}
