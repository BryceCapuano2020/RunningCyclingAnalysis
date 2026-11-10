import './zodConfig.ts'
import { z } from 'zod'

/** The most characters an activity's name may have once the athlete sets it. */
export const MAX_ACTIVITY_NAME_CHARS = 100

/** A C0 control character or DEL, which has no place in a title. */
function isControl(char: string): boolean {
  const code = char.charCodeAt(0)
  return code < 0x20 || code === 0x7f
}

/**
 * A name the athlete gives an activity: trimmed, 1 to 100 characters, with no control characters, so a pasted
 * line break cannot split a title in the list or the page heading.
 */
export const ActivityNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_ACTIVITY_NAME_CHARS)
  .refine((name) => ![...name].some(isControl), 'A name has no control characters')

/** The body of PATCH /api/activities/:id/name. */
export const ActivityRenameSchema = z.object({ name: ActivityNameSchema })
export type ActivityRename = z.infer<typeof ActivityRenameSchema>

/** The name the activity now holds. */
export const ActivityRenameResultSchema = ActivityRenameSchema
export type ActivityRenameResult = z.infer<typeof ActivityRenameSchema>
