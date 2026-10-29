import type { Sport } from '../types'

/**
 * Whether an indoor activity's efforts can hold a best, by sport. A treadmill's belt speed, a footpod's
 * pace, or the speed of an indoor-track, virtual or GPS-off run is not a distance covered, so a run held indoors is kept in volume, time and heart-rate zones
 * but never in a curve, a record, a threshold or a prediction. A trainer ride's power comes from its
 * meter, so it counts as an outdoor ride's does.
 */
const INDOOR_EFFORTS_COUNT: Record<Sport, boolean> = { run: false, ride: true }

/** The two fields of a digest or a summary that say whether its efforts can hold a best. */
export interface EffortSource {
  sport: Sport
  indoor: boolean
}

/** Whether an activity's best efforts count for records, curves, thresholds, predictions and the balance. */
export function effortsCount(activity: EffortSource): boolean {
  return !activity.indoor || INDOOR_EFFORTS_COUNT[activity.sport]
}
