import { HR_BLOCK_S, HR_SKIP_S } from '../constants'
import { medianInPlace, quantile, rollingMean } from '../math'
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
   * hard interval reads low for a few seconds of the rolling mean, while a strap that fails does so for minutes. On a
   * file long enough for the probes to be spaced wider than 30 s it is three probe steps at least, so one low probe
   * never makes a run.
   */
  minRunS: 90,
} as const

/** The settings of the judgement, with any numbers: the defaults are literal types. */
export type HeartRateForPowerSettings = {
  readonly [K in keyof typeof HR_IMPLAUSIBLE_FOR_POWER]: number
}

/**
 * The stretches where heart rate is far below the athlete's own level elsewhere in the activity at about the
 * same power (see HR_IMPLAUSIBLE_FOR_POWER). A strap that drops out or locks onto cadence in the middle of an
 * effort is one; a whole activity read low is not, because it has nothing of its own to fall below, and the
 * library's set-aside judges it against the athlete's reference heart rate instead.
 */
export function implausiblyLowHeartRate(
  a: Activity,
  minValidBpm: number,
  t: HeartRateForPowerSettings = HR_IMPLAUSIBLE_FOR_POWER,
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

  // The probes ordered by power, so those within a probe's power band are one run of this order.
  const byPower = probes.slice().sort((x, y) => powerMean[x]! - powerMean[y]!)
  const sortedPower = Float64Array.from(byPower, (i) => powerMean[i]!)
  const sortedHr = Float64Array.from(byPower, (i) => hrMean[i]!)
  const scratch = new Float64Array(byPower.length)
  const low = new Uint8Array(n)
  for (const i of probes) {
    const centre = powerMean[i]!
    const band = t.powerBand * centre
    const from = firstWhere(sortedPower, (v) => v - centre >= -band)
    const to = firstWhere(sortedPower, (v) => v - centre > band)
    let count = 0
    for (let k = from; k < to; k++) {
      if (Math.abs(byPower[k]! - i) >= t.windowS) scratch[count++] = sortedHr[k]!
    }
    if (count < t.minComparable) continue
    if (hrMean[i]! < t.maxShare * medianInPlace(scratch.subarray(0, count))) {
      low.fill(1, i - stepS / 2, i + stepS / 2)
    }
  }
  return runsWhere(n, (i) => low[i] === 1).filter(
    (run) => run.end - run.start >= Math.max(t.minRunS, 3 * stepS),
  )
}

/** The first index of an ascending array where `test` holds, or its length when it never does. `test` must only turn true once. */
function firstWhere(sorted: Float64Array, test: (value: number) => boolean): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (test(sorted[mid]!)) hi = mid
    else lo = mid + 1
  }
  return lo
}
