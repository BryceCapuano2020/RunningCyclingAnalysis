import './zodConfig.ts'
import { z } from 'zod'
import {
  EQUIPMENT,
  LIFT_EXERCISE_LENGTH,
  LIFT_EXERCISE_PATTERN,
  LIFT_LOAD_KG,
  LIFT_REPS,
  LIFT_RPE,
  LIFT_SET_ORDER,
  LIFT_TIME_PATTERN,
  MAX_LIFT_KEYS_PER_DELETE,
  MAX_LIFT_SETS_PER_WRITE,
  isLiftDate,
  isLiftLoad,
  isLiftRpe,
  liftSetKey,
  parseLiftSetKey,
} from '@rca/core/lift'

/**
 * One logged set (lift-data.md, section 1). Every bound is read from core, so the API, the browser
 * store and a later CSV reader refuse the same things (`readLiftSet` is the same rule without zod;
 * the sweep in lifts.test.ts is the guard against the two drifting apart).
 */
export const LiftSetSchema = z
  .strictObject({
    date: z.string().refine(isLiftDate, 'Not a date from 1970 to 2100'),
    time: z.string().regex(LIFT_TIME_PATTERN).optional(),
    timePrecision: z.enum(['set', 'session']).optional(),
    exercise: z
      .string()
      .min(LIFT_EXERCISE_LENGTH.min)
      .max(LIFT_EXERCISE_LENGTH.max)
      .regex(LIFT_EXERCISE_PATTERN),
    equipment: z.enum(EQUIPMENT),
    setOrder: z.number().int().min(LIFT_SET_ORDER.min).max(LIFT_SET_ORDER.max),
    reps: z.number().int().min(LIFT_REPS.min).max(LIFT_REPS.max),
    loadKg: z
      .number()
      .min(LIFT_LOAD_KG.min)
      .max(LIFT_LOAD_KG.max)
      .refine(isLiftLoad, 'At most two decimals'),
    rpe: z
      .number()
      .min(LIFT_RPE.min)
      .max(LIFT_RPE.max)
      .refine(isLiftRpe, 'In steps of 0.5')
      .optional(),
    warmup: z.literal(true).optional(),
  })
  .refine((set) => (set.time === undefined) === (set.timePrecision === undefined), {
    message: 'time and timePrecision come together',
  })

/** Refuses a repeated key, flagging the second occurrence at `<field>.<index>`. */
function refuseRepeats(field: 'sets' | 'keys', keys: string[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>()
  keys.forEach((key, i) => {
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [field, i], message: 'Repeated key' })
    seen.add(key)
  })
}

/**
 * A write: 1 to MAX_LIFT_SETS_PER_WRITE sets, each inserted or replaced by its key, no key twice.
 * `insertOnly` asks the server to keep sets that already exist instead of replacing them.
 */
export const LiftWriteSchema = z
  .strictObject({
    sets: z.array(LiftSetSchema).min(1).max(MAX_LIFT_SETS_PER_WRITE),
    insertOnly: z.literal(true).optional(),
  })
  .superRefine((write, ctx) => refuseRepeats('sets', write.sets.map(liftSetKey), ctx))

/** A delete: 1 to MAX_LIFT_KEYS_PER_DELETE set keys. */
export const LiftDeleteSchema = z
  .strictObject({
    keys: z
      .array(z.string().refine((key) => parseLiftSetKey(key) !== null, 'Not a set key'))
      .min(1)
      .max(MAX_LIFT_KEYS_PER_DELETE),
  })
  .superRefine((del, ctx) => refuseRepeats('keys', del.keys, ctx))

/** One page of sets in key order; `next` is the cursor for the following page, null at the end. */
export const LiftPageSchema = z.strictObject({
  items: z.array(LiftSetSchema),
  next: z.string().nullable(),
})

export type LiftWrite = z.infer<typeof LiftWriteSchema>
export type LiftDelete = z.infer<typeof LiftDeleteSchema>
export type LiftPage = z.infer<typeof LiftPageSchema>
