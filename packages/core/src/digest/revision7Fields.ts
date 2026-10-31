import type { Activity, ActivityDigest } from '../types'

/** The optional fields revision 7 adds that come straight from the activity. */
export function revision7Fields(
  activity: Activity,
): Pick<ActivityDigest, 'localDayShift' | 'athleteType'> {
  return {
    ...(activity.localDayShift === undefined ? {} : { localDayShift: activity.localDayShift }),
    // The athlete's own label, when the export's list says the activity is not a run or a ride.
    ...(activity.athleteType === undefined ? {} : { athleteType: activity.athleteType }),
  }
}
