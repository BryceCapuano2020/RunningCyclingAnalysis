import './zodConfig.ts'
import { z } from 'zod'
import {
  DISTANCE_BEST_TOLERANCE,
  DURATIONS_S,
  MAX_KM_SPLITS,
  MAX_MILE_SPLITS,
  RUN_RECORD_DISTANCES_M,
} from '@rca/core/constants'
import type { ActivityDigest } from '@rca/core/types'
import { checkEvidence, evidenceFields } from './digestEvidence.ts'
import { MAX_DIGEST_BYTES } from './limits.ts'

/**
 * JSON has no NaN: JSON.stringify writes non-finite numbers as null. Fields typed `number` in
 * ActivityDigest therefore accept null on the wire and come back as NaN.
 */
const nanNumber = z
  .number()
  .nullable()
  .transform((v) => v ?? Number.NaN)

/** Fields typed `number | null` in ActivityDigest: null is a real value, not a NaN. */
const nullableNumber = z.number().nullable()

const sport = z.enum(['run', 'ride'])

/**
 * Names, ids and quality messages. Free text is bounded by the whole digest budget, which the API
 * enforces on the JSON; this keeps any single string from being unbounded in the schema itself.
 */
const text = z.string().max(MAX_DIGEST_BYTES)

/** Most quality flags a digest keeps. The producer slices to the same count. */
const MAX_FLAGS = 50
/**
 * Durations are not otherwise bounded, so the counts below also have absolute caps. Both are sized
 * for a seven-day activity.
 */
const MAX_SECONDS = 7 * 24 * 60 * 60
/** HR blocks are 300 s long and start after a 600 s warm-up. */
const MAX_HR_BLOCKS = Math.floor((MAX_SECONDS - 600) / 300)
/** Each climb section is at least 120 s and sections do not overlap. */
const MAX_CLIMB_SECTIONS = Math.floor(MAX_SECONDS / 120)

/**
 * Moving time and averages, added after the first digests were stored. Older digests lack them and
 * read as absent, so they carry no model revision.
 */
const movingAverageFields = {
  movingS: z.number().int().nonnegative().optional(),
  avgHeartRate: nullableNumber.optional(),
  avgPowerW: nullableNumber.optional(),
  sessionKey: text.optional(),
  walkingPace: z.literal(true).optional(),
}

const qualityKind = z.enum([
  'hr-dropout',
  'hr-spike',
  'hr-implausible-for-power',
  'power-spike',
  'power-dropout',
  'speed-spike',
  'implausible-speed',
  'altitude-jump',
  'implausible-climb',
  'stream-disagreement',
  'missing-altitude',
])

const qualityFlag = z.object({
  kind: qualityKind,
  start: z.number(),
  end: z.number(),
  message: text,
})

const powerTerms = z.object({
  gravityAccel: nanNumber,
  rolling: nanNumber,
  aero: nanNumber,
})

const curvePoint = z.object({
  durationS: nanNumber,
  value: nanNumber,
  startIndex: z.number(),
  windowS: nanNumber,
  heartRate: nullableNumber,
  terms: powerTerms.nullable(),
})

const hrBlock = z.object({
  heartRate: nanNumber,
  value: nanNumber,
  terms: powerTerms.nullable(),
})

/** A run's best time over one record distance, which must be in RUN_RECORD_DISTANCES_M. */
const distanceBest = z.object({
  distanceM: z.number().refine((m) => RUN_RECORD_DISTANCES_M.some((d) => d === m), {
    message: 'Not a run record distance',
  }),
  seconds: z.number().positive(),
})

const digestSplit = z.object({
  distanceM: z.number().nonnegative(),
  seconds: z.number().nonnegative().nullable(),
  gradeAdjustedSeconds: z.number().nonnegative().nullable(),
  elevationGainM: z.number().nonnegative().nullable(),
  avgHeartRate: z.number().nonnegative().nullable(),
})

/**
 * Runs only, so absent on rides and on digests made before splits were kept. Each unit is bounded
 * by the shared limit in @rca/core, times the factor: 1 for a create, and the stored factor for a row.
 */
const digestSplits = (factor: number) =>
  z.object({
    km: z.array(digestSplit).max(MAX_KM_SPLITS * factor),
    mile: z.array(digestSplit).max(MAX_MILE_SPLITS * factor),
  })

const climbSection = z.object({
  start: z.number(),
  end: z.number(),
  measuredW: nanNumber,
  terms: powerTerms,
})

const calibrationSums = z.object({
  blocks: nanNumber,
  rr: nanNumber,
  ra: nanNumber,
  aa: nanNumber,
  rP: nanNumber,
  rG: nanNumber,
  aP: nanNumber,
  aG: nanNumber,
})

/** The fields the distance-best rules read, which the create and stored schemas both have. */
interface DistanceBestsFields {
  sport: 'run' | 'ride'
  distanceM: number
  durationS: number
  distanceBests?: { distanceM: number; seconds: number }[]
}

/**
 * Runs only; ascending distances, each covered by the run, each no longer than the activity. A run
 * covers a distance within DISTANCE_BEST_TOLERANCE of it. A time is at most the activity's over
 * (1 - DISTANCE_BEST_TOLERANCE), for every distance: a run whose only clean stretch falls a little
 * short of a distance it covers (a jump in its first or last seconds) is timed over that stretch and
 * scaled up to the distance. The stored schema applies these too: rows written before the field do
 * not exist, so nothing is lost.
 */
function checkDistanceBests(digest: DistanceBestsFields, ctx: z.RefinementCtx): void {
  const bests = digest.distanceBests
  if (bests === undefined) return
  if (digest.sport !== 'run') {
    ctx.addIssue({
      code: 'custom',
      path: ['distanceBests'],
      message: 'Only runs have distance bests',
    })
    return
  }
  bests.forEach((best, index) => {
    const path = ['distanceBests', index]
    if (index > 0 && best.distanceM <= bests[index - 1]!.distanceM) {
      ctx.addIssue({ code: 'custom', path, message: 'Distance bests must ascend' })
    } else if (!(best.distanceM * (1 - DISTANCE_BEST_TOLERANCE) <= digest.distanceM)) {
      ctx.addIssue({ code: 'custom', path, message: 'The run does not cover this distance' })
    } else if (!(best.seconds <= digest.durationS / (1 - DISTANCE_BEST_TOLERANCE))) {
      ctx.addIssue({ code: 'custom', path, message: 'Time exceeds the digest duration' })
    }
  })
}
/** Moving seconds are a part of the duration: a pause or a record gap is never more than the whole. */
function checkMovingTime(
  digest: { durationS: number; movingS?: number },
  ctx: z.RefinementCtx,
): void {
  if (digest.movingS !== undefined && digest.movingS > digest.durationS) {
    ctx.addIssue({
      code: 'custom',
      path: ['movingS'],
      message: 'Moving time exceeds the duration',
    })
  }
}

/** Stored rows may be larger than a create can send, by this factor, and still be read. */
const STORED_BOUND_FACTOR = 4

/**
 * Wire format of an ActivityDigest. Parsing restores NaN, so the output type is the
 * in-memory ActivityDigest; the check below keeps the two definitions from drifting apart.
 *
 * Every bound applies to every revision. Stored rows from older revisions are read with the same
 * schema, so a revision cannot be used to smuggle in a larger digest.
 */
export const ActivityDigestSchema = z
  .object({
    version: z.literal(1),
    /** Missing on older wire records means the original analysis model. */
    // Stored/read digests can come from a newer deployment; tolerate them so libraries remain
    // listable, while the create request schema rejects revisions this server cannot write.
    modelRevision: z
      .number()
      .refine(Number.isSafeInteger, 'Expected a positive safe integer')
      .min(1)
      .default(1),
    id: text,
    name: text,
    sport,
    /** Required finite: the server derives the dedupe key from it. */
    startMs: z.number(),
    durationS: z.number().int().nonnegative(),
    distanceM: nanNumber,
    elevationGainM: nanNumber,
    hasHeartRate: z.boolean(),
    indoor: z.boolean(),
    powerSource: z.enum(['measured', 'virtual', 'none']),
    flags: z.array(qualityFlag).max(MAX_FLAGS),
    flagCounts: z.partialRecord(qualityKind, z.number().int().nonnegative()),
    maxHeartRate: nullableNumber,
    curve: z.array(curvePoint).length(DURATIONS_S.length),
    hrBlocks: z.array(hrBlock).max(MAX_HR_BLOCKS),
    calibration: calibrationSums.nullable(),
    climbSections: z.array(climbSection).max(MAX_CLIMB_SECTIONS),
    distanceBests: z.array(distanceBest).max(RUN_RECORD_DISTANCES_M.length).optional(),
    splits: digestSplits(1).optional(),
    ...movingAverageFields,
    ...evidenceFields,
  })
  .superRefine((digest, ctx) => {
    digest.curve.forEach((point, index) => {
      if (point.durationS !== DURATIONS_S[index]) {
        ctx.addIssue({
          code: 'custom',
          path: ['curve', index, 'durationS'],
          message: 'Invalid curve duration',
        })
      }
    })
    const maxBlocks = Math.max(0, Math.floor((digest.durationS - 600) / 300))
    if (digest.hrBlocks.length > maxBlocks) {
      ctx.addIssue({
        code: 'custom',
        path: ['hrBlocks'],
        message: 'Too many HR blocks for the digest duration',
      })
    }
    if (digest.climbSections.length > digest.durationS) {
      ctx.addIssue({
        code: 'custom',
        path: ['climbSections'],
        message: 'Too many climb sections for the digest duration',
      })
    }
    checkDistanceBests(digest, ctx)
    checkMovingTime(digest, ctx)
    checkEvidence(digest, ctx)
  })

/**
 * An ActivityDigest as read back from a stored row. Rows written by older revisions can miss the
 * create-time rules (a null duration, a curve off the grid), so those rules are not applied here;
 * the distance-best rules are, because no row predates them.
 * The array bounds stay, at STORED_BOUND_FACTOR times the create limits, so one row cannot grow
 * the response without limit. Creates keep using ActivityDigestSchema.
 */
const StoredActivityDigestBase = z.object({
  version: z.literal(1),
  modelRevision: z
    .number()
    .refine(Number.isSafeInteger, 'Expected a positive safe integer')
    .min(1)
    .default(1),
  id: text,
  name: text,
  sport,
  startMs: z.number(),
  durationS: nanNumber,
  distanceM: nanNumber,
  elevationGainM: nanNumber,
  hasHeartRate: z.boolean(),
  indoor: z.boolean(),
  powerSource: z.enum(['measured', 'virtual', 'none']),
  flags: z.array(qualityFlag).max(MAX_FLAGS * STORED_BOUND_FACTOR),
  flagCounts: z.partialRecord(qualityKind, z.number().int().nonnegative()),
  maxHeartRate: nullableNumber,
  curve: z.array(curvePoint).max(DURATIONS_S.length * STORED_BOUND_FACTOR),
  hrBlocks: z.array(hrBlock).max(MAX_HR_BLOCKS * STORED_BOUND_FACTOR),
  calibration: calibrationSums.nullable(),
  climbSections: z.array(climbSection).max(MAX_CLIMB_SECTIONS * STORED_BOUND_FACTOR),
  distanceBests: z.array(distanceBest).max(RUN_RECORD_DISTANCES_M.length).optional(),
  splits: digestSplits(STORED_BOUND_FACTOR).optional(),
  ...movingAverageFields,
  ...evidenceFields,
})

export const StoredActivityDigestSchema = StoredActivityDigestBase.superRefine((digest, ctx) => {
  checkDistanceBests(digest, ctx)
  checkMovingTime(digest, ctx)
  checkEvidence(digest, ctx)
})

export type ActivityDigestJson = z.input<typeof ActivityDigestSchema>

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

/** Compile-time check: the parsed output is exactly the ActivityDigest type from @rca/core. */
export type DigestSchemaMatchesCore = Expect<
  Equal<z.output<typeof ActivityDigestSchema>, ActivityDigest>
>

/** Compile-time check: stored digests parse to the same ActivityDigest type as creates. */
export type StoredDigestSchemaMatchesCore = Expect<
  Equal<z.output<typeof StoredActivityDigestSchema>, ActivityDigest>
>
