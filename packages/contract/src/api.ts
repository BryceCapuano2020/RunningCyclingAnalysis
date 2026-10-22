import { z } from 'zod'
import { ActivityDigestSchema } from './digest.ts'

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
  id: z.string(),
  email: z.email(),
  name: z.string(),
  pictureUrl: z.string().nullable(),
})
export type User = z.infer<typeof UserSchema>

export const MeSchema = z.object({
  user: UserSchema,
  profile: ProfileSchema,
})
export type Me = z.infer<typeof MeSchema>

export const ActivityCreateSchema = z.object({
  digest: ActivityDigestSchema,
  fileName: z.string().min(1).max(255),
  /** Lowercase hex SHA-256 of the original file. */
  fileHash: z.string().regex(/^[0-9a-f]{64}$/),
})
export type ActivityCreate = z.input<typeof ActivityCreateSchema>

export const ActivityRecordSchema = z.object({
  id: z.string(),
  digest: ActivityDigestSchema,
  fileName: z.string(),
  hasFile: z.boolean(),
  fileSize: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int(),
})
export type ActivityRecord = z.infer<typeof ActivityRecordSchema>

/** One page of GET /api/activities. nextCursor is null on the last page. */
export const ActivityPageSchema = z.object({
  items: z.array(ActivityRecordSchema),
  nextCursor: z.string().nullable(),
})
export type ActivityPage = z.infer<typeof ActivityPageSchema>

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

/** Local development only: POST /api/auth/dev-login. */
export const DevLoginSchema = z.object({
  email: z.email().transform((s) => s.toLowerCase()),
  name: z.string().trim().min(1).max(100),
})
export type DevLogin = z.input<typeof DevLoginSchema>
