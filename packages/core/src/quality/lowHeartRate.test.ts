import { describe, expect, it } from 'vitest'
import { mulberry32, quantile, rollingMean } from '../math'
import type { Activity } from '../types'
import { HR_IMPLAUSIBLE_FOR_POWER, implausiblyLowHeartRate } from './lowHeartRate'
import type { HeartRateForPowerSettings } from './lowHeartRate'
import type { Range } from './runs'
import { runsWhere } from './runs'

/** The judgement as it was before the power order: every probe against every other, a sorted copy each. */
function referenceLowHeartRate(
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
  return runsWhere(n, (i) => low[i] === 1).filter(
    (run) => run.end - run.start >= Math.max(t.minRunS, 3 * stepS),
  )
}

/** A ride with a few power levels, heart rate that follows power, and strap failures, gaps and pauses. */
function randomRide(rand: () => number): Activity {
  const n = 1800 + Math.floor(rand() * 9000)
  const levels = Array.from({ length: 2 + Math.floor(rand() * 4) }, () => 120 + rand() * 200)
  const power = new Float64Array(n)
  let level = levels[0]!
  for (let i = 0; i < n; i++) {
    if (i % 240 === 0) level = levels[Math.floor(rand() * levels.length)]!
    power[i] = rand() < 0.01 ? 0 : level + (rand() - 0.5) * 30
  }
  const heartRate = Float64Array.from(power, (w) => 90 + 0.25 * w + (rand() - 0.5) * 6)
  for (let f = 0; f < Math.floor(rand() * 4); f++) {
    const start = Math.floor(rand() * n)
    heartRate.fill(55 + rand() * 25, start, Math.min(n, start + 200 + Math.floor(rand() * 900)))
  }
  for (let g = 0; g < Math.floor(rand() * 6); g++) heartRate[Math.floor(rand() * n)] = NaN
  const paused = new Uint8Array(n)
  for (let p = 0; p < Math.floor(rand() * 3); p++) {
    const start = Math.floor(rand() * n)
    paused.fill(1, start, Math.min(n, start + Math.floor(rand() * 300)))
  }
  return { n, power, heartRate, paused } as unknown as Activity
}

describe('implausiblyLowHeartRate against the per-probe sort it replaced', () => {
  it('finds the same stretches on random rides, with the default settings', () => {
    const rand = mulberry32(31)
    let found = 0
    for (let trial = 0; trial < 40; trial++) {
      const activity = randomRide(rand)
      const expected = referenceLowHeartRate(activity, 30)
      found += expected.length
      expect(implausiblyLowHeartRate(activity, 30)).toEqual(expected)
    }
    expect(found).toBeGreaterThan(0)
  })

  it('finds the same stretches with closer probes, a tighter band and fewer needed', () => {
    const rand = mulberry32(32)
    const tight = {
      ...HR_IMPLAUSIBLE_FOR_POWER,
      stepS: 7,
      powerBand: 0.04,
      minComparable: 3,
      minRunS: 40,
    }
    for (let trial = 0; trial < 25; trial++) {
      const activity = randomRide(rand)
      expect(implausiblyLowHeartRate(activity, 30, tight)).toEqual(
        referenceLowHeartRate(activity, 30, tight),
      )
    }
  })

  it('finds the same stretches when many probes share one power and one heart rate', () => {
    const n = 6000
    const power = new Float64Array(n).fill(200)
    const heartRate = new Float64Array(n).fill(150)
    heartRate.fill(80, 3000, 4200)
    const activity = { n, power, heartRate, paused: new Uint8Array(n) } as unknown as Activity
    const expected = referenceLowHeartRate(activity, 30)
    expect(expected.length).toBeGreaterThan(0)
    expect(implausiblyLowHeartRate(activity, 30)).toEqual(expected)
  })
})
