/**
 * The revision of what the analysis works out from the digests at combine time: thresholds, grades, predictions, fitness,
 * the lean. A stored result (a server snapshot, the device copy) made under another revision is stale: the browser does not
 * show it and the state job computes it again. It is not `MODEL_REVISION`, which versions the digests themselves, so moving
 * it rebuilds no digest.
 *
 * It moves with every row of the model ledger (docs/design/model-ledger.md), which records each change to a figure the
 * athlete sees: `analysisRevision.test.ts` fails when the ledger gains a row until `ANALYSIS_LEDGER_ROWS` is the ledger's
 * count and `ANALYSIS_REVISION` has moved with it (the pair is pinned: the revision is the row count less 13).
 */
export const ANALYSIS_REVISION = 3

/** The model-ledger rows this revision accounts for. */
export const ANALYSIS_LEDGER_ROWS = 16
