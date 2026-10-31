import { cadenceLockStretches, CADENCE_LOCK } from '../quality/cadenceLock'
import { compareKinds, messageFor, QUALITY_THRESHOLDS } from '../quality/assess'
import type { Range } from '../quality/runs'
import type { Activity, QualityFlag, QualityReport } from '../types'
import { cadenceInSportUnit, resolveGpxRunCadence } from './gpxCadence'

/**
 * The gate every revision-7 change reads (D12 section 1.9). A digest is made at `MODEL_REVISION` unless a test
 * asks for another; below 7 none of the changes here runs, so the bytes of a digest do not move until the
 * release that writes revision 7 removes the gate.
 */
export const REVISION_7 = 7

/** Whether a digest made at `revision` has the revision-7 changes. */
export const hasRevision7 = (revision: number): boolean => revision >= REVISION_7

/** The seconds of the stretches, widened by the margin, with those closer than the flag merge gap joined. */
function lockRanges(stretches: Range[], n: number): Range[] {
  const merged: Range[] = []
  for (const { start, end } of stretches) {
    const from = Math.max(0, start - CADENCE_LOCK.marginS)
    const to = Math.min(n, end + CADENCE_LOCK.marginS)
    const last = merged[merged.length - 1]
    if (last !== undefined && from - last.end < QUALITY_THRESHOLDS.flagMergeGapS) {
      last.end = Math.max(last.end, to)
    } else {
      merged.push({ start: from, end: to })
    }
  }
  return merged
}

/**
 * The quality of an activity with its cadence-locked heart rate left out: the stretch is cleared from
 * `validHeartRate`, so the maximum, averages, curves' heart rates, blocks and splits skip it as they skip a
 * spike, and flagged `hr-cadence-lock`. An activity with no heart rate, or no cadence in a unit that can be
 * told, is not checked and comes back as it was.
 */
export function withCadenceLock(
  activity: Activity,
  quality: QualityReport,
  moving: Uint8Array,
): QualityReport {
  if (!activity.hasHeartRate) return quality
  const cadence = cadenceInSportUnit(activity, moving)
  if (cadence === null) return quality
  const ranges = lockRanges(cadenceLockStretches(activity.heartRate, cadence, moving), activity.n)
  if (ranges.length === 0) return quality
  const validHeartRate = Uint8Array.from(quality.validHeartRate)
  const locks: QualityFlag[] = ranges.map(({ start, end }) => {
    validHeartRate.fill(0, start, end)
    return {
      kind: 'hr-cadence-lock',
      start,
      end,
      message: messageFor('hr-cadence-lock', end - start),
    }
  })
  const flags = [...quality.flags, ...locks].sort(
    (a, b) => a.start - b.start || compareKinds(a.kind, b.kind),
  )
  return { ...quality, flags, validHeartRate }
}

/**
 * The activity as the walking-pace rule reads it: a GPX run whose cadence unit can be told has it in steps a
 * minute, which the rule reads; any other is the activity itself. The Activity is never changed.
 */
export function walkingPaceView(activity: Activity, moving: Uint8Array): Activity {
  const steps = resolveGpxRunCadence(activity, moving)
  return steps === null ? activity : { ...activity, cadence: steps, cadenceUnit: 'steps/min' }
}
