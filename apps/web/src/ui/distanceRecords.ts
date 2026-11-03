import { HALF_MARATHON_M, MARATHON_M, RUN_RECORD_DISTANCES_M } from '@rca/core/constants'
import type { RunRecordDistanceM } from '@rca/core/constants'
import { effortsCount } from '@rca/core/digest'
import type { ActivitySummary } from '@rca/core/pipeline'
import { formatPace, formatRecordTime, METRES_PER_KM, METRES_PER_MILE } from '@rca/core/units'
import type { UnitSystem } from '@rca/core/units'

/*
 * A run's best time over each record distance (the mile, 5 km, the half marathon, ...) and the distances one activity has its own
 * time at. Split from records.ts, which re-exports it.
 */

/** A run record distance's name: the marathon or the half marathon, the mile, else whole kilometres. */
export function distanceName(distanceM: RunRecordDistanceM): string {
  if (distanceM === MARATHON_M) return 'marathon'
  if (distanceM === HALF_MARATHON_M) return 'half marathon'
  return distanceM === METRES_PER_MILE
    ? `${distanceM / METRES_PER_MILE} mi`
    : `${distanceM / METRES_PER_KM} km`
}

export interface DistanceRecord {
  distanceM: RunRecordDistanceM
  label: string
  seconds: number
  /** The time as m:ss, or h:mm:ss from an hour. */
  time: string
  /** The pace in the unit preference. */
  pace: string
  activity: ActivitySummary
}

export interface DistanceRecords {
  records: DistanceRecord[]
  /** True when some runs in scope were digested before distance bests, so the list may be short. */
  partial: boolean
}

/** Whether a starts before b: the earlier start first, then the smaller id, as in the analysis. */
function startsBefore(a: ActivitySummary, b: ActivitySummary): boolean {
  if (a.startMs !== b.startMs) return a.startMs < b.startMs
  return a.id < b.id
}

/**
 * The fastest run at each record distance among the activities in scope. A tie goes to the earlier
 * activity. A treadmill run holds no record (see effortsCount). Runs with no distance bests are not
 * counted as having none, so `partial` tells the page the list may be incomplete.
 */
export function distanceRecords(activities: ActivitySummary[], units: UnitSystem): DistanceRecords {
  const runs = activities.filter((activity) => activity.sport === 'run' && effortsCount(activity))
  const covered = runs.filter((activity) => activity.distanceBests !== undefined)
  const records: DistanceRecord[] = []
  for (const distanceM of RUN_RECORD_DISTANCES_M) {
    let best: { seconds: number; activity: ActivitySummary } | null = null
    for (const activity of covered) {
      const seconds = activity.distanceBests?.find((b) => b.distanceM === distanceM)?.seconds
      if (seconds === undefined) continue
      if (best === null || seconds < best.seconds) best = { seconds, activity }
      else if (seconds === best.seconds && startsBefore(activity, best.activity)) {
        best = { seconds, activity }
      }
    }
    if (best !== null) records.push(distanceRecordOf(distanceM, best.seconds, best.activity, units))
  }
  return { records, partial: covered.length > 0 && covered.length < runs.length }
}

/** A run's time over one record distance, with the activity that ran it. */
function distanceRecordOf(
  distanceM: RunRecordDistanceM,
  seconds: number,
  activity: ActivitySummary,
  units: UnitSystem,
): DistanceRecord {
  return {
    distanceM,
    label: distanceName(distanceM),
    seconds,
    time: formatRecordTime(seconds),
    pace: formatPace(distanceM / seconds, units),
    activity,
  }
}

/** Whether a distance's pace is its time: the mile in miles, or the kilometre in kilometres. */
export function paceIsTime(distanceM: number, units: UnitSystem): boolean {
  return distanceM === (units === 'imperial' ? METRES_PER_MILE : METRES_PER_KM)
}

/** Whether a distance is one that a run record is kept for. */
function isRunRecordDistance(distanceM: number): distanceM is RunRecordDistanceM {
  return RUN_RECORD_DISTANCES_M.some((record) => record === distanceM)
}

/**
 * The run distances one activity has its own time at, in ascending distance. These are its own
 * times, not all of them records; a ride has none.
 */
export function ownDistanceRecords(activity: ActivitySummary, units: UnitSystem): DistanceRecord[] {
  return (activity.distanceBests ?? []).flatMap((best) =>
    isRunRecordDistance(best.distanceM)
      ? [distanceRecordOf(best.distanceM, best.seconds, activity, units)]
      : [],
  )
}
