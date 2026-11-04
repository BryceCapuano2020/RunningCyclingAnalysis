import { describe, expect, it } from 'vitest'
import { PRIORS } from '../constants'
import { metabolicToFlatSpeed, metabolicToRidePower } from '../metabolic'
import type { ThresholdEstimate } from '../threshold'
import { equivalenceFor } from './combine'
import { thresholdRunSpeed } from './equivalents'

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
  const equivalence = equivalenceFor(null)

  it('is the equivalence of the threshold in watts, at the centre', () => {
    const threshold = estimate(3.4)
    const watts = metabolicToRidePower(3.4, 72, PRIORS.grossEfficiency.mean)
    expect(thresholdRunSpeed(equivalence, threshold, 72)?.p50).toBeCloseTo(
      equivalence(watts, 72).p50,
      9,
    )
  })

  it('is the same pace whatever the body mass, since mass cancels in the equivalence', () => {
    const threshold = estimate(3.4)
    const light = thresholdRunSpeed(equivalence, threshold, 55)
    const heavy = thresholdRunSpeed(equivalence, threshold, 90)
    expect(light?.p50).toBeCloseTo(heavy?.p50 ?? Number.NaN, 6)
  })

  it('orders its ends and widens them past the equivalence alone', () => {
    const threshold = estimate(3.4)
    const speed = thresholdRunSpeed(equivalence, threshold, 72)!
    const alone = thresholdRunSpeed(equivalence, estimate(3.4, 0), 72)!
    expect(speed.p05).toBeLessThan(alone.p05)
    expect(alone.p05).toBeLessThan(speed.p50)
    expect(speed.p50).toBeLessThan(alone.p95)
    expect(alone.p95).toBeLessThan(speed.p95)
  })

  it('is a speed a runner costs the same energy for: near the flat speed of the same W/kg', () => {
    const speed = thresholdRunSpeed(equivalence, estimate(3.4), 72)!
    const flat = metabolicToFlatSpeed(3.4)
    // The equivalence is the central draw of the efficiency and economy priors, so it sits near the plain conversion.
    expect(speed.p50 / flat).toBeGreaterThan(0.9)
    expect(speed.p50 / flat).toBeLessThan(1.1)
  })

  it('is null without a threshold', () => {
    expect(thresholdRunSpeed(equivalence, null, 72)).toBeNull()
  })
})
