import { z } from 'zod'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { ActivityDigestSchema, StoredActivityDigestSchema } from './digest.ts'

export const ProfileInputSchema = z.object({
  massKg: z.number().min(30).max(200),
  bikeMassKg: z.number().min(3).max(30),
  units: z.enum(['imperial', 'metric']),
  keepFiles: z.boolean(),
})
export type ProfileInput = z.infer<typeof ProfileInputSchema>

/** Timestamps are epoch milliseconds. */
export const ProfileSchema = ProfileInputSchema.extend({
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

export const ActivityCreateSchema = z
  .object({
    digest: ActivityDigestSchema,
    fileName: z.string().min(1).max(255),
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
  id: z.string().max(64),
  /** Read leniently: a stored row may come from an older revision that create would refuse. */
  digest: StoredActivityDigestSchema,
  fileName: z.string().max(255),
  hasFile: z.boolean(),
  fileSize: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int(),
})
export type ActivityRecord = z.infer<typeof ActivityRecordSchema>

/**
 * One page of GET /api/activities. nextCursor is null on the last page. unreadable counts stored
 * activities on this page that the server could not read, so they are left out of items.
 */
export const ActivityPageSchema = z.object({
  items: z.array(ActivityRecordSchema),
  nextCursor: z.string().max(256).nullable(),
  unreadable: z.number().int().nonnegative().optional(),
})
export type ActivityPage = z.infer<typeof ActivityPageSchema>

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
