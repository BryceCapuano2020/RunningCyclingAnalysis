import { z } from 'zod'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { ActivityDigestSchema, StoredActivityDigestSchema } from './digest.ts'
import { WEIGHT_LIMITS_KG } from './athlete.ts'
import { MAX_CURSOR_CHARS, MAX_FILE_NAME_CHARS, MAX_RECORD_ID_CHARS } from './limits.ts'

export const SexSchema = z.enum(['female', 'male'])
export type Sex = z.infer<typeof SexSchema>

/** Year of birth: only the year is asked, for age grading. */
export const BirthYearSchema = z.number().int().min(1900).max(2100)

/** Body mass in kg. Null until the rider enters one: nothing assumes a weight. */
const MassKgSchema = z.number().min(WEIGHT_LIMITS_KG.body.min).max(WEIGHT_LIMITS_KG.body.max)

/**
 * A profile write. Body mass, year of birth and sex are optional: left out, the saved value is kept,
 * so a write that does not mention them leaves them alone; null clears them. Only null clears a body
 * mass, which is how a weight the rider has not entered is stored.
 */
export const ProfileInputSchema = z.object({
  massKg: MassKgSchema.nullable().optional(),
  bikeMassKg: z.number().min(WEIGHT_LIMITS_KG.bike.min).max(WEIGHT_LIMITS_KG.bike.max),
  units: z.enum(['imperial', 'metric']),
  keepFiles: z.boolean(),
  birthYear: BirthYearSchema.nullable().optional(),
  sex: SexSchema.nullable().optional(),
})
export type ProfileInput = z.infer<typeof ProfileInputSchema>

/** Timestamps are epoch milliseconds. A profile saved before age and sex existed reads them as null. */
export const ProfileSchema = ProfileInputSchema.extend({
  massKg: MassKgSchema.nullable(),
  birthYear: BirthYearSchema.nullable().default(null),
  sex: SexSchema.nullable().default(null),
  updatedAt: z.number().int(),
})
export type Profile = z.infer<typeof ProfileSchema>

export const UserSchema = z.object({
  id: z.string().max(64),
  email: z.email().max(320),
  name: z.string().max(512),
  pictureUrl: z.string().max(2048).nullable(),
})
export type User = z.infer<typeof UserSchema>

export const MeSchema = z.object({
  user: UserSchema,
  profile: ProfileSchema,
  /** False when this deployment has no original-file storage binding; absent means legacy available. */
  fileRetentionAvailable: z.boolean().optional(),
})
export type Me = z.infer<typeof MeSchema>
/** GET /api/me answers a signed-out visitor with a null body, rather than an error. */
export const MeResponseSchema = MeSchema.nullable()

export const ActivityCreateSchema = z
  .object({
    digest: ActivityDigestSchema,
    fileName: z.string().min(1).max(MAX_FILE_NAME_CHARS),
    /** Lowercase hex SHA-256 of the original file. */
    fileHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .superRefine(({ digest }, ctx) => {
    if (digest.modelRevision > MODEL_REVISION) {
      ctx.addIssue({
        code: 'custom',
        path: ['digest', 'modelRevision'],
        message: `This server supports model revisions through ${MODEL_REVISION}`,
      })
    }
  })
export type ActivityCreate = z.input<typeof ActivityCreateSchema>

export const ActivityRecordSchema = z.object({
  id: z.string().max(MAX_RECORD_ID_CHARS),
  /** Read leniently: a stored row may come from an older revision that create would refuse. */
  digest: StoredActivityDigestSchema,
  fileName: z.string().max(MAX_FILE_NAME_CHARS),
  hasFile: z.boolean(),
  fileSize: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int(),
})
export type ActivityRecord = z.infer<typeof ActivityRecordSchema>

/**
 * One page of GET /api/activities. nextCursor is null on the last page. unreadable counts stored
 * activities on this page that could not be read, so they are left out of items. The server leaves
 * out a digest that is not JSON; the client leaves out one that fails the schema.
 */
export const ActivityPageSchema = z.object({
  items: z.array(ActivityRecordSchema),
  nextCursor: z.string().max(MAX_CURSOR_CHARS).nullable(),
  unreadable: z.number().int().nonnegative().optional(),
})
export type ActivityPage = z.infer<typeof ActivityPageSchema>

/**
 * A page as the server sends it: the server only checks that each digest is JSON, so the digest is
 * left unchecked here and the reader validates it record by record (see listActivities).
 */
export const ActivityPageWireSchema = ActivityPageSchema.extend({
  items: z.array(ActivityRecordSchema.extend({ digest: z.unknown() })),
})
export type ActivityPageWire = z.infer<typeof ActivityPageWireSchema>

/** The message summarises validation issues, so it can run longer than a sentence. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().max(64),
    message: z.string().max(4096),
  }),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

/** Local development only: POST /api/auth/dev-login. */
export const DevLoginSchema = z.object({
  email: z
    .email()
    .max(320)
    .transform((s) => s.toLowerCase()),
  name: z.string().trim().min(1).max(100),
})
export type DevLogin = z.input<typeof DevLoginSchema>
