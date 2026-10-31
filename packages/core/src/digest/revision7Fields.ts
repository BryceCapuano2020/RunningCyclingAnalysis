import type { Activity, ActivityDigest } from '../types'

/** The optional fields revision 7 adds that come straight from the activity. */
export function revision7Fields(activity: Activity): Pick<ActivityDigest, 'localDayShift'> {
  return activity.localDayShift === undefined ? {} : { localDayShift: activity.localDayShift }
}
