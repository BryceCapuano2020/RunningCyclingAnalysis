import { LIFT_REVISION } from '@rca/core/lift'
import { ANALYSIS_REVISION, STATE_SNAPSHOT_VERSION } from '@rca/core/stateSnapshot'

/** Each part of the tuple is below this, so the three read as one number in the same order as the tuple. */
const PART = 1000

/**
 * The one ordered revision of what a stored snapshot was made under: the analysis revision, the snapshot's schema version
 * and the lift estimator's revision, compared in that order. It is stored as one integer (`state_jobs.analysis_revision`,
 * a column that held the analysis revision alone until a result revision replaced it, so every earlier row reads as lower),
 * in the R2 object's custom metadata, and compared everywhere the analysis revision was: a lower one is recomputed, a higher
 * one is a later Worker's and is never overwritten.
 */
export function resultRevisionOf(analysis: number, schema: number, lift: number): number {
  for (const part of [analysis, schema, lift]) {
    if (!Number.isInteger(part) || part < 0 || part >= PART) {
      throw new Error('result revision: a part is outside 0 to 999')
    }
  }
  return (analysis * PART + schema) * PART + lift
}

/** What this build writes. */
export const RESULT_REVISION = resultRevisionOf(
  ANALYSIS_REVISION,
  STATE_SNAPSHOT_VERSION,
  LIFT_REVISION,
)
