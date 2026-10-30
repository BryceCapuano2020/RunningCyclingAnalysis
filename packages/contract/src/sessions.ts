import './zodConfig.ts'
import { z } from 'zod'

/** One sign-in of this account. Carries no identifier: sessions are revoked as a set. */
export const SessionInfoSchema = z.object({
  createdAt: z.number().int(),
  expiresAt: z.number().int(),
  /** True for the session that made the request. */
  current: z.boolean(),
})
export type SessionInfo = z.infer<typeof SessionInfoSchema>

/** GET /api/sessions: the account's sessions, newest first. */
export const SessionListSchema = z.object({ sessions: z.array(SessionInfoSchema) })
export type SessionList = z.infer<typeof SessionListSchema>

/** DELETE /api/sessions: how many sessions were ended. */
export const SessionRevokeSchema = z.object({ revoked: z.number().int().nonnegative() })
export type SessionRevoke = z.infer<typeof SessionRevokeSchema>
