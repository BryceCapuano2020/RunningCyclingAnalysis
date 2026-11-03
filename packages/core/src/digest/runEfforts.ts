import { CP_FIT_MIN_S, HR_BLOCK_S } from '../constants'
import { possibleRunWkg } from '../curves'
import { DURATION_TABLES, prepareRide } from '../threshold'
import type { RideEffort, ThresholdBlock } from '../threshold'
import type { ActivityDigest } from '../types'
import { effortsCount } from './effortTrust'
import { ofSport } from './ordered'
import { runCentralWkg } from './rideCurves'
import { LONGEST_EFFORT_S } from './thresholdEfforts'
import type { ActivityEfforts } from './thresholdEfforts'

/**
 * One run's bests from 3 to 60 min and its 5 min heart-rate blocks, each as the run best curve would admit it: a point faster
 * than the ceiling for its duration is dropped (`runCentralWkg`), and the heart rate of a run set aside (`heartAside`) is none,
 * with its blocks. A run is priced from its pace alone, so none of it is estimated. Run through `effortsCount` before this: a
 * treadmill run holds no best.
 */
export function runEffortsOf(digest: ActivityDigest, heartAside: boolean): ActivityEfforts {
  const efforts: RideEffort[] = []
  const blocks: ThresholdBlock[] = []
  for (const point of digest.curve) {
    if (point.durationS < CP_FIT_MIN_S || point.durationS > LONGEST_EFFORT_S) continue
    const wkg = runCentralWkg(point)
    if (!(wkg > 0) || !Number.isFinite(wkg)) continue
    efforts.push({
      activityId: digest.id,
      durationS: point.durationS,
      value: wkg,
      heartRate: heartAside ? null : point.heartRate,
      estimated: false,
    })
  }
  if (!heartAside) {
    for (const block of digest.hrBlocks) {
      const value = possibleRunWkg(HR_BLOCK_S, block.value)
      if (value > 0 && Number.isFinite(value)) {
        blocks.push({ activityId: digest.id, heartRate: block.heartRate, value })
      }
    }
  }
  return {
    startMs: digest.startMs,
    efforts,
    blocks,
    prepared: prepareRide(digest.id, efforts, blocks, DURATION_TABLES.run),
  }
}

/** Every counted run of the digests, read once: what each gives the estimate, in the order given. */
export function runsOf(
  ordered: ActivityDigest[],
  heartSetAside: ReadonlySet<string>,
): ActivityEfforts[] {
  return ofSport(ordered, 'run')
    .filter(effortsCount)
    .map((digest) => runEffortsOf(digest, heartSetAside.has(digest.id)))
}
