import { MODEL_REVISION } from './digest/modelRevision'
import { snapshotOf } from './lookback/snapshot'
import type { CheckInSnapshot } from './lookback/snapshot'
import { analysedOf } from './sessionBuild'
import type { SessionState } from './sessionState'
import type { ActivityDigest } from './types'

/**
 * The library as the analysis reads it (duplicates and runs left out of every analysis not counted), summarised for
 * "since your last import" with the look-back of `state`.
 */
export function checkInSnapshotOf(
  digests: ActivityDigest[],
  state: SessionState,
  nowMs: number,
): CheckInSnapshot {
  const { analysed } = analysedOf(digests)
  return snapshotOf(
    {
      digests: analysed,
      lookBack: state.lookBack,
      revision: MODEL_REVISION,
    },
    nowMs,
  )
}
