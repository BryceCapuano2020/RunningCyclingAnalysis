import { HR_BLOCK_S, HR_SKIP_S } from '../constants'
import { quantile, rollingMean } from '../math'
import type { Activity } from '../types'
import type { Range } from './runs'
import { runsWhere } from './runs'

/**
 * When heart rate reads too low for the power. The athlete's own heart rate in the same activity at a
 * comparable power is the reference, so a fit athlete's easy 104 bpm at 207 W is not mistaken for a strap
 * fault the way a fixed bpm floor mistakes it: only a stretch whose heart rate is far below what the athlete
 * shows elsewhere in the activity for about the same power can be.
 */
export const HR_IMPLAUSIBLE_FOR_POWER = {
  /** The stretch judged, s: the rolling mean of power and of heart rate over it. */
  windowS: HR_BLOCK_S,
  /** Heart rate settles over the warm-up, so nothing before this, s, is judged or used as reference. */
  settleS: HR_SKIP_S,
  /** The stretches are judged this often, s, or less often where that would be more than maxProbes of them. */
  stepS: 30,
  /** The most stretches judged in one activity, since each is compared with all the others: a week-long file stays cheap. */
  maxProbes: 400,
  /** A stretch's comparable power is within this share of its own on either side. */
  powerBand: 0.15,
  /** At least this many comparable stretches, clear of the one judged, make a reference; fewer judge nothing. */
  minComparable: 8,
  /** A stretch reads too low when its heart rate is under this share of the reference. */
  maxShare: 0.75,
  /** A stretch needs at least this share of the activity's median power to be judged. */
  minPowerShare: 0.5,
  /**
   * A flagged run shorter than this, s, is dropped: heart rate lags power by a minute or two, so the start of a
   * hard interval reads low for a few seconds of the rolling mean, while a strap that fails does so for minutes.
   */
  minRunS: 90,
} as const

/**
 * The stretches where heart rate is far below the athlete's own level elsewhere in the activity at about the
 * same power (see HR_IMPLAUSIBLE_FOR_POWER). A strap that drops out or locks onto cadence in the middle of an
 * effort is one; a whole activity read low is not, because it has nothing of its own to fall below, and the
 * library's set-aside judges it against the athlete's reference heart rate instead.
 */
export function implausiblyLowHeartRate(
  a: Activity,
  minValidBpm: number,
  t: typeof HR_IMPLAUSIBLE_FOR_POWER = HR_IMPLAUSIBLE_FOR_POWER,
): Range[] {
  const { n, power, heartRate, paused } = a
  const watts: number[] = []
  for (let i = t.settleS; i < n; i++) {
    if (paused[i] !== 1 && power[i]! > 0) watts.push(power[i]!)
  }
  if (watts.length === 0) return []
  const minPowerW = t.minPowerShare * quantile(watts, 0.5)

  const powerMean = rollingMean(power, t.windowS)
  const hrMean = rollingMean(heartRate, t.windowS)
  const half = Math.floor(t.windowS / 2)
  const span = n - half - (t.settleS + half)
  const stepS = Math.max(t.stepS, Math.ceil(span / t.maxProbes))
  const probes: number[] = []
  for (let i = t.settleS + half; i < n - half; i += stepS) {
    if (powerMean[i]! >= minPowerW && hrMean[i]! >= minValidBpm) probes.push(i)
  }

  const low = new Uint8Array(n)
  for (const i of probes) {
    const comparable: number[] = []
    for (const j of probes) {
      const near = Math.abs(powerMean[j]! - powerMean[i]!) <= t.powerBand * powerMean[i]!
      if (near && Math.abs(j - i) >= t.windowS) comparable.push(hrMean[j]!)
    }
    if (comparable.length < t.minComparable) continue
    if (hrMean[i]! < t.maxShare * quantile(comparable, 0.5)) {
      low.fill(1, i - stepS / 2, i + stepS / 2)
    }
  }
  return runsWhere(n, (i) => low[i] === 1).filter((run) => run.end - run.start >= t.minRunS)
}
