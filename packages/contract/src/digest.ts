import { z } from 'zod'
import { DURATIONS_S } from '@rca/core/constants'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import type { ActivityDigest } from '@rca/core/types'

// These contracts run in strict-CSP browsers and Workers, where dynamic code generation is blocked.
z.config({ jitless: true })

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

const qualityKind = z.enum([
  'hr-dropout',
  'hr-spike',
  'hr-implausible-for-power',
  'power-spike',
  'power-dropout',
  'speed-spike',
  'altitude-jump',
  'missing-altitude',
])

const qualityFlag = z.object({
  kind: qualityKind,
  start: z.number(),
  end: z.number(),
  message: z.string(),
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

/**
 * Wire format of an ActivityDigest. Parsing restores NaN, so the output type is the
 * in-memory ActivityDigest; the check below keeps the two definitions from drifting apart.
 */
export const ActivityDigestSchema = z
  .object({
    version: z.literal(1),
    /** Missing on older wire records means the original analysis model. */
    // Stored/read digests can come from a newer deployment; tolerate them so libraries remain
    // listable, while the create request schema below rejects revisions this server cannot write.
    modelRevision: z
      .number()
      .refine(Number.isSafeInteger, 'Expected a positive safe integer')
      .min(1)
      .default(1),
    id: z.string(),
    name: z.string(),
    sport,
    /** Required finite: the server derives the dedupe key from it. */
    startMs: z.number(),
    durationS: nanNumber,
    distanceM: nanNumber,
    elevationGainM: nanNumber,
    hasHeartRate: z.boolean(),
    indoor: z.boolean(),
    powerSource: z.enum(['measured', 'virtual', 'none']),
    flags: z.array(qualityFlag).max(50),
    flagCounts: z.partialRecord(qualityKind, z.number()),
    maxHeartRate: nullableNumber,
    curve: z.array(curvePoint),
    hrBlocks: z.array(hrBlock),
    calibration: calibrationSums.nullable(),
    climbSections: z.array(climbSection),
  })
  .superRefine((digest, ctx) => {
    if (digest.modelRevision !== MODEL_REVISION) return

    if (!Number.isInteger(digest.durationS) || digest.durationS < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationS'],
        message: 'Invalid current-revision duration',
      })
    }
    if (digest.curve.length !== DURATIONS_S.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['curve'],
        message: 'Invalid current-revision curve length',
      })
    } else {
      digest.curve.forEach((point, index) => {
        if (point.durationS !== DURATIONS_S[index]) {
          ctx.addIssue({
            code: 'custom',
            path: ['curve', index, 'durationS'],
            message: 'Invalid current-revision curve duration',
          })
        }
      })
    }
    const maxBlocks = Math.max(0, Math.floor((digest.durationS - 600) / 300))
    if (digest.hrBlocks.length > maxBlocks) {
      ctx.addIssue({
        code: 'custom',
        path: ['hrBlocks'],
        message: 'Too many current-revision HR blocks',
      })
    }
    if (digest.climbSections.length > digest.durationS) {
      ctx.addIssue({
        code: 'custom',
        path: ['climbSections'],
        message: 'Too many current-revision climb sections',
      })
    }
  })

export type ActivityDigestJson = z.input<typeof ActivityDigestSchema>

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

/** Compile-time check: the parsed output is exactly the ActivityDigest type from @rca/core. */
export type DigestSchemaMatchesCore = Expect<
  Equal<z.output<typeof ActivityDigestSchema>, ActivityDigest>
>
