import type { Activity } from '@rca/core/types'
import { WORKBENCH_ENTRY_BYTES } from './workbenchStore'

/** Estimates output size before activityTraceOf clones any of the source streams. */
export function activityFitsEntry(activity: Activity): boolean {
  const n = activity.n
  if (
    !Number.isInteger(n) ||
    n < 0 ||
    activity.distance.length !== n ||
    activity.paused.length !== n
  )
    return false
  if (
    activity.speed.length !== n ||
    activity.altitude.length !== n ||
    activity.heartRate.length !== n ||
    activity.power.length !== n ||
    (activity.cadence !== undefined && activity.cadence.length !== n) ||
    (activity.temperature !== undefined && activity.temperature.length !== n) ||
    (activity.unrecorded !== undefined && activity.unrecorded.length !== n)
  )
    return false
  const streamCount =
    3 + (activity.hasPower ? 1 : 0) + (activity.cadence ? 1 : 0) + (activity.temperature ? 1 : 0)
  const bytes =
    activity.distance.byteLength +
    activity.paused.byteLength +
    n +
    n * 4 * streamCount +
    // The left-out masks and the speed pace zones read, at most.
    7 * n +
    (activity.cadenceUnit?.length ?? 0) * 2 +
    (activity.laps ?? []).reduce((sum, lap) => sum + 32 + (lap.label?.length ?? 0) * 2, 0)
  return bytes <= WORKBENCH_ENTRY_BYTES
}
