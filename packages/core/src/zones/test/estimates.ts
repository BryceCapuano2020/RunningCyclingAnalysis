import type { AnalysisResult } from '../../digest/combine'
import type { ThresholdStep } from '../../digest/thresholdTimelineTypes'
import type { CriticalPowerFit } from '../../types'
import type { ZoneEstimates } from '../zones'

type Figures = Pick<
  AnalysisResult,
  | 'runCp'
  | 'rideCp'
  | 'runMaxHeartRate'
  | 'rideMaxHeartRate'
  | 'runObservedMaxHeartRate'
  | 'rideObservedMaxHeartRate'
>

/** One threshold that holds on every date. */
function always(fit: CriticalPowerFit | null): ThresholdStep[] {
  return fit === null ? [] : [{ fromMs: 0, fit, asOfMs: null, lastFit: 0 }]
}

/**
 * Zone estimates in which an analysis's own thresholds hold on every date, as the whole library's did before the
 * thresholds followed the athlete's fitness, so a test of what zones are cut from them need not build a timeline.
 */
export function estimatesOf(figures: Figures): ZoneEstimates {
  return {
    runMaxHeartRate: figures.runMaxHeartRate,
    rideMaxHeartRate: figures.rideMaxHeartRate,
    runObservedMaxHeartRate: figures.runObservedMaxHeartRate,
    rideObservedMaxHeartRate: figures.rideObservedMaxHeartRate,
    observedMaxSource: { run: null, ride: null },
    thresholds: { run: always(figures.runCp), ride: always(figures.rideCp) },
  }
}
