import './zodConfig.ts'
import { z } from 'zod'

/*
 * The parts of a state snapshot beside `state`: the check-in and the lift results (docs/design/server-authority.md). Both are
 * encoded as `state` is (`encodeValue` in @rca/core/stateSnapshot), so a number here is a plain finite one. Core cannot import
 * this package (this one imports core), so the reading functions in core cast; the two places that meet the wire check it
 * here first: the state job before it stores a snapshot, and the web before it applies one.
 */

const MS = z.number().int().min(0).max(100_000_000_000_000)
const MAX_SPORTS = 8
const MAX_BESTS = 256
/** A sport's workouts as delta-encoded base 36: a few characters each, at most a few hundred thousand workouts. */
const KEYS_MAX = 2_000_000

/** A value for each sport the build knows, so a new sport changes no bound here. */
const perSport = <T extends z.ZodType>(value: T) =>
  z
    .record(z.string().min(1).max(16), value)
    .refine((found) => Object.keys(found).length <= MAX_SPORTS, 'too many sports')

const BestSchema = z.strictObject({
  effort: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('duration'), durationS: z.number().min(0).max(1_000_000) }),
    z.strictObject({ kind: z.literal('distance'), distanceM: z.number().min(0).max(100_000_000) }),
  ]),
  unit: z.enum(['m/s', 'W', 'W/kg', 's']),
  value: z.number().min(-1_000_000_000).max(1_000_000_000),
  atMs: MS,
  key: z.string().min(1).max(64),
})

/** The `CheckInSnapshot` of the library as the analysis reads it (@rca/core/lookback). */
export const CheckInSnapshotSchema = z.strictObject({
  v: z.literal(1),
  revision: z.number().int().min(1).max(1_000_000),
  atMs: MS,
  asOfMs: MS,
  keys: perSport(z.string().max(KEYS_MAX)),
  counts: perSport(z.number().int().min(0).max(10_000_000)),
  bests: perSport(z.array(BestSchema).max(MAX_BESTS)),
})

const MAX_LIFTS = 1_000
const objects = z.record(z.string().min(1).max(96), z.unknown())

/** The `LiftResults` of the account's sets (@rca/core/lift): the date and the state's top-level fields are checked, the rest is core's. */
export const LiftResultsSchema = z.strictObject({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  state: z.strictObject({
    revision: z.number().int().min(1).max(1_000_000),
    lifts: z.array(z.record(z.string(), z.unknown())).max(MAX_LIFTS),
    weeks: z.array(z.record(z.string(), z.unknown())).max(5_000),
  }),
  histories: objects.refine((found) => Object.keys(found).length <= MAX_LIFTS, 'too many lifts'),
  windows: objects.refine((found) => Object.keys(found).length <= MAX_LIFTS, 'too many lifts'),
  order: z.array(z.string().min(1).max(96)).max(MAX_LIFTS),
  lead: z.record(z.string(), z.unknown()).nullable(),
  bigThree: z.record(z.string(), z.unknown()),
  bigThreeGrades: z.array(z.record(z.string(), z.unknown())).max(16),
  corner: z.record(z.string(), z.unknown()),
  levels: z.strictObject({
    metric: z.array(z.record(z.string(), z.unknown())).max(32).nullable(),
    imperial: z.array(z.record(z.string(), z.unknown())).max(32).nullable(),
  }),
})
