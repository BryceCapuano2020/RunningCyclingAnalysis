/** What `session.ts` re-exports, so the session's own file holds the session. */
export { haltsImport, isTransient, stopsSaving, SyncFailure } from './saveFailure'
export type { SyncIssue, SyncIssueCode } from './saveFailure'
export type { ImportFacts, RejectedFile, SessionState } from './sessionState'
export type { HeldOutActivity } from './sessionLibrary'
export type { Period, PeriodChoice } from './period'
export type { RejectCode, Rejection } from './import/result'
// The device library keeps one copy per workout by the same rule the analysis uses.
export { copyOfDigest, workoutKey, outranks } from './duplicates'
export type { Copy } from './duplicates'

export type { DeferredFailure, SyncItem, SyncSink } from './sessionSync'
export type { FileId, HeldFiles } from './importHeld'
