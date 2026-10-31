import { cadenceLockStretches, CADENCE_LOCK } from '../quality/cadenceLock'
import { POWER_OUTLIER, lonePowerSpikes } from '../quality/powerOutlier'
import { compareKinds, messageFor, QUALITY_THRESHOLDS } from '../quality/assess'
import type { Range } from '../quality/runs'
import type { Activity, QualityFlag, QualityReport } from '../types'
import { cadenceInSportUnit, resolveGpxRunCadence } from './gpxCadence'

/**
 * The changes revision 7 makes to a digest (D12 section 2). They were built behind a gate on the revision a digest is
 * made at, so the bytes of a digest did not move before the release that writes revision 7; that release removed the
 * gate, and every digest has them.
 */

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

/**
 * The share of a best window that may be unusable seconds (a dropped sample, a flagged spike) before the window no
 * longer counts: 1%, so a window of a few minutes survives one bad second and a window of a minute and a half or less
 * survives none. Revision 7 reads it in `meanMaximal`; below 7 no unusable second is allowed in a window.
 */
export const BEST_WINDOW_GAP_SHARE = 0.01

/**
 * The quality of an activity with its lone power spikes left out: the second and a second either side are cleared from
 * `validPower` (as the 2,000 W rule clears them) and flagged `power-spike`, so one dropped packet cannot make a best.
 * An activity without power comes back as it was.
 */
export function withLonePowerSpikes(activity: Activity, quality: QualityReport): QualityReport {
  if (!activity.hasPower) return quality
  // A second over the 2,000 W rule's ceiling is already flagged (with its margin) there; it is not flagged twice.
  const spikes = lonePowerSpikes(activity.power).filter(
    (i) => activity.power[i]! <= QUALITY_THRESHOLDS.powerSpike.maxW,
  )
  if (spikes.length === 0) return quality
  const validPower = Uint8Array.from(quality.validPower)
  const found: QualityFlag[] = spikes.map((i) => {
    const start = Math.max(0, i - POWER_OUTLIER.marginS)
    const end = Math.min(activity.n, i + POWER_OUTLIER.marginS + 1)
    validPower.fill(0, start, end)
    return { kind: 'power-spike', start, end, message: messageFor('power-spike', end - start) }
  })
  const flags = [...quality.flags, ...found].sort(
    (a, b) => a.start - b.start || compareKinds(a.kind, b.kind),
  )
  return { ...quality, flags, validPower }
}
