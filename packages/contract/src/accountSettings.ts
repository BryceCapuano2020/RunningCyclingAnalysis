import './zodConfig.ts'
import { z } from 'zod'
import { isCountableKey, MAX_COUNTED_RUNS } from '@rca/core/athlete'
import { periodChoiceOf } from '@rca/core/period'
import type { PeriodChoice } from '@rca/core/period'

/** The most rides whose implausible power the athlete can keep, and the longest activity id among them. */
export const MAX_KEPT_POWER = 500
const KEPT_POWER_ID_CHARS = 128

/**
 * One period choice as the account keeps it: a period the control offers or a custom range, never the
 * default (which is null: the athlete has picked none). A value of another shape is refused.
 */
const PeriodSchema = z.custom<Exclude<PeriodChoice, 'default'>>(
  (value) => value !== 'default' && periodChoiceOf(value) !== undefined,
  'Not a period',
)

/**
 * The choices an athlete makes that are not activity data and used to live in one browser: the rides
 * whose implausible power is kept, the runs counted at walking pace and the period on screen. A field
 * that was never set is null, which is how a first sign-in knows to offer the browser's value; one set
 * to an empty list is a choice and the account's value wins. GET and PUT /api/settings both carry it.
 */
export const AccountSettingsSchema = z.strictObject({
  keepPower: z.array(z.string().min(1).max(KEPT_POWER_ID_CHARS)).max(MAX_KEPT_POWER).nullable(),
  countedRuns: z
    .array(z.string().refine(isCountableKey, 'Not a workout key'))
    .max(MAX_COUNTED_RUNS)
    .nullable(),
  period: PeriodSchema.nullable(),
})
export type AccountSettings = z.infer<typeof AccountSettingsSchema>

/** What an account holds before any choice is saved. */
export const NO_ACCOUNT_SETTINGS: AccountSettings = {
  keepPower: null,
  countedRuns: null,
  period: null,
}
