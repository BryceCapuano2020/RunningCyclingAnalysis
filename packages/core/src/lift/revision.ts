/**
 * Names the estimator that made a LiftState. Separate from MODEL_REVISION: lifting is its own model
 * and moving it must not re-run any run or ride digest (strength.md, decision 3). Sets store raw
 * values and e1RM is computed on read, so raising this needs no migration. Only ever raised: the server orders its stored
 * snapshots by it (apps/api/src/state/resultRevision.ts), so a lower value is never healed.
 */
export const LIFT_REVISION = 4
