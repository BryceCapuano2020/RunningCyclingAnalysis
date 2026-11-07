import './zodConfig.ts'
import { z } from 'zod'
import { LiftPageSchema } from './lifts.ts'

/** The account's lift revision: raised by every write and delete (users.lift_revision). */
const liftRevision = z.number().int().nonnegative()

/** GET /api/lifts: one page and the account's revision when it was read. */
export const LiftPageAnswerSchema = LiftPageSchema.extend({ liftRevision })

/**
 * PUT /api/lifts. `skipped` lists the keys an `insertOnly` write left alone because the account
 * already held them; it is empty for any other write.
 */
export const LiftWriteAnswerSchema = z.strictObject({
  liftRevision,
  skipped: z.array(z.string()),
})

/** POST /api/lifts/delete. A key with no stored set is not an error. */
export const LiftDeleteAnswerSchema = z.strictObject({ liftRevision })

export type LiftPageAnswer = z.infer<typeof LiftPageAnswerSchema>
export type LiftWriteAnswer = z.infer<typeof LiftWriteAnswerSchema>
export type LiftDeleteAnswer = z.infer<typeof LiftDeleteAnswerSchema>
