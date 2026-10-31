import type { Activity, ActivityDigest } from '../types'

/**
 * The gate every revision-7 field reads (D12 section 1.9). A digest is made at `MODEL_REVISION` unless a test
 * asks for another; below 7 none of the fields here is written, so the bytes of a digest do not move until
 * the release that writes revision 7 removes the gate.
 */
export const REVISION_7 = 7

/** Whether a digest made at `revision` has the revision-7 fields. */
export const hasRevision7 = (revision: number): boolean => revision >= REVISION_7

/** The optional fields revision 7 adds that come straight from the activity, or nothing below 7. */
export function revision7Fields(
  activity: Activity,
  revision: number,
): Pick<ActivityDigest, 'localDayShift'> {
  if (!hasRevision7(revision)) return {}
  return activity.localDayShift === undefined ? {} : { localDayShift: activity.localDayShift }
}
