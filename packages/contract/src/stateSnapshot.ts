import './zodConfig.ts'
import { z } from 'zod'
import { CheckInSnapshotSchema, LiftResultsSchema } from './stateSnapshotParts.ts'

/**
 * The envelope of a state snapshot, as `GET /api/state` serves it (docs/design/server-compute.md, decision 7). Only the
 * envelope is checked here: `state` is the encoded `SessionState` that `@rca/core/stateSnapshot` reads, and a reader applies
 * it only when `snapshotIsCurrent` says its shape and model are the build's own, so a newer or older snapshot parses and is
 * then left alone rather than refused.
 */
export const StateSnapshotSchema = z.strictObject({
  schemaVersion: z.number().int().min(1),
  modelRevision: z.number().int().min(1),
  /** The combine-time analysis revision; absent from a snapshot made before it existed, which is then stale. */
  analysisRevision: z.number().int().min(1).optional(),
  /** The lift estimator revision the lift results were made under; absent from a snapshot made before they were carried. */
  liftRevision: z.number().int().min(1).max(1_000_000).optional(),
  libraryVersion: z.number().int().min(0),
  nowMs: z.number().int().min(0),
  /** The viewer's zone, an IANA name. */
  zone: z.string().min(1).max(64),
  buildSha: z.string().min(1).max(64),
  state: z.record(z.string(), z.unknown()),
  /** The encoded `LiftResults` (`@rca/core/stateSnapshot` reads it, as it does `state`); absent from a copy made on a device. */
  lift: LiftResultsSchema.optional(),
  /** The encoded `CheckInSnapshot`, null for an empty library; absent from a copy made on a device. */
  checkIn: CheckInSnapshotSchema.nullable().optional(),
})
export type StateSnapshotWire = z.infer<typeof StateSnapshotSchema>
