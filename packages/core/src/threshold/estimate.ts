import { fuse } from './fusion'
import { heartRateEstimate } from './heartRateEstimate'
import { powerEstimate } from './powerEstimate'
import type { ThresholdBlock, ThresholdEffort, ThresholdEstimate } from './types'

/**
 * The ride threshold from every effort in the window (docs/design/threshold.md). The power estimate is a floor built from each
 * ride's strongest effort; heart rate is a second estimate that can lift the answer and, within the power estimate's own noise,
 * lower it, never veto it. `efforts` are the bests of each ride from 3 to 60 min with `ageDays` counted back from the newest
 * activity; `blocks` are the 5 min blocks of power-meter rides with usable heart rate (the analysis leaves out rides whose
 * heart rate it sets aside); `thresholdHr` is the heart rate at threshold, or null. All values share one unit. Null only where no
 * ride has an effort of 3 min or more.
 */
export function rideThreshold(
  efforts: readonly ThresholdEffort[],
  blocks: readonly ThresholdBlock[],
  thresholdHr: number | null,
): ThresholdEstimate | null {
  const power = powerEstimate(efforts)
  if (power === null) return null
  const heartRate = heartRateEstimate(efforts, blocks, thresholdHr, power.value)
  const fused = fuse(power.value, power.relativeError, 'refused' in heartRate ? null : heartRate)
  return {
    value: fused.value,
    low: fused.low,
    high: fused.high,
    efforts: { value: power.value, rides: power.rides, strongest: power.strongest },
    heartRate:
      'refused' in heartRate ? heartRate : { value: heartRate.value, efforts: heartRate.efforts },
  }
}
