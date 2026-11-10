import { AnalysisSession } from '@rca/core/session'
import type { SessionState } from '@rca/core/session'
import { toSnapshot } from '@rca/core/stateSnapshot'
import type { StateSnapshot } from '@rca/core/stateSnapshot'
import type { AthleteSettings } from '@rca/core/types'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 8 }

/** A state with results that is not the sample: what a kept library's analysis looks like. */
export function resultState(): SessionState {
  return { ...new AnalysisSession().loadSample(SETTINGS), isSample: false }
}

/** A snapshot of that state, made at `nowMs` in `zone`. */
export function snapshotAt(nowMs: number, zone = 'UTC', state = resultState()): StateSnapshot {
  return toSnapshot(state, { libraryVersion: 0, nowMs, zone, buildSha: 'device' })
}
