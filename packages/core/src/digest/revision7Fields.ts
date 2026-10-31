import type { Activity, ActivityDigest } from '../types'
import { hasRevision7 } from './revision7Gate'

/** The optional fields revision 7 adds that come straight from the activity, or nothing below 7. */
export function revision7Fields(
  activity: Activity,
  revision: number,
): Pick<ActivityDigest, 'localDayShift'> {
  if (!hasRevision7(revision)) return {}
  return activity.localDayShift === undefined ? {} : { localDayShift: activity.localDayShift }
}
