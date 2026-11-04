import { describe, expect, it } from 'vitest'
import { metabolicToFlatSpeed } from '../metabolic'
import type { ThresholdEstimate } from '../threshold'
import { thresholdRunSpeed } from './equivalents'
import { CYCLING_ANCHOR_LOG_SD, anchorFactor, rideRunSpeed } from './rideAnchor'

/** A synthetic ride threshold: `value` gross metabolic W/kg, with its range a share either side. */
function estimate(value: number, spread = 0.06): ThresholdEstimate {
  return {
    value,
    low: value * (1 - spread),
    high: value * (1 + spread),
    efforts: {
      value,
      relativeError: 0.025,
      rides: 4,
      strongest: { activityId: 'ride-1', durationS: 3000, estimated: false },
    },
    heartRate: { refused: 'no-heart-rate' },
  }
}

describe('thresholdRunSpeed', () => {
  it('is the anchored running speed of the threshold at the centre', () => {
    expect(thresholdRunSpeed(estimate(22), 'male')?.p50).toBeCloseTo(
      metabolicToFlatSpeed(anchorFactor('male') * 22),
      9,
    )
  })

  it("is the anchor's own range alone for a threshold with no range of its own", () => {
    const alone = thresholdRunSpeed(estimate(22, 0), 'female')!
    expect(alone).toEqual(rideRunSpeed({ value: 22 }, 'female'))
    expect(alone.p05).toBeLessThan(alone.p50)
    expect(alone.p95).toBeGreaterThan(alone.p50)
  })

  it("widens the threshold's own low and high by the anchor, in quadrature on the log scale", () => {
    const threshold = estimate(22, 0.06)
    const speed = thresholdRunSpeed(threshold, 'male')!
    const energy = (v: number) => (v * 3.9 + 1.22) / anchorFactor('male')
    const anchor = 1.645 * CYCLING_ANCHOR_LOG_SD
    expect(Math.log(energy(speed.p05) / 22)).toBeCloseTo(
      -Math.hypot(Math.log(22 / threshold.low), anchor),
      9,
    )
    expect(Math.log(energy(speed.p95) / 22)).toBeCloseTo(
      Math.hypot(Math.log(threshold.high / 22), anchor),
      9,
    )
    // Wider than either alone.
    const narrow = thresholdRunSpeed(estimate(22, 0), 'male')!
    expect(speed.p95 - speed.p05).toBeGreaterThan(narrow.p95 - narrow.p05)
  })

  it('moves the same way with a threshold as with a ride of that energy, and with sex', () => {
    const woman = thresholdRunSpeed(estimate(22), 'female')!
    const man = thresholdRunSpeed(estimate(22), 'male')!
    expect(woman.p50).not.toBeCloseTo(man.p50, 3)
  })

  it('is null without a threshold', () => {
    expect(thresholdRunSpeed(null, 'male')).toBeNull()
  })
})
