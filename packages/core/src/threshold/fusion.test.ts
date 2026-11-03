import { describe, expect, it, vi } from 'vitest'
import { FUSION_GRID, GAP_PRIOR } from './constants'
import { ERROR_STEP, fuse } from './fusion'

const POWER = 250
const heartRate = (share: number, relativeError = 0.04) => ({
  value: POWER * share,
  relativeError,
})

describe('fusing the power estimate with heart rate', () => {
  it('with no heart rate answers the power estimate itself, with the range round it', () => {
    const { value, low, high } = fuse(POWER, 0.025, null)
    expect(value).toBe(POWER)
    expect(low).toBeLessThan(value)
    expect(high).toBeGreaterThan(value)
  })

  it('never answers above what heart rate reads', () => {
    for (const share of [1.01, 1.03, 1.06, 1.1]) {
      const { value } = fuse(POWER, 0.025, heartRate(share))
      expect(value, `${share}`).toBeGreaterThan(POWER)
      expect(value, `${share}`).toBeLessThanOrEqual(POWER * share)
    }
  })

  it('draws the range wide upward, where a rider who never went hard would be, and tight downward', () => {
    const { value, low, high } = fuse(POWER, 0.025, null)
    expect(high - value).toBeGreaterThan(2 * (value - low))
    // The floor: the 10th percentile is no lower than the power estimate less its own noise.
    expect(low).toBeGreaterThan(POWER * (1 - 2 * 0.025))
  })

  it('follows heart rate almost all the way up', () => {
    expect(fuse(POWER, 0.025, heartRate(1.2)).value / POWER).toBeGreaterThan(1.17)
  })

  it('never goes under the answer without heart rate, however low heart rate reads', () => {
    for (const powerError of [0.025, 0.06]) {
      const alone = fuse(POWER, powerError, null)
      for (const share of [0.5, 0.8, 0.95, 1, 1.02]) {
        const fused = fuse(POWER, powerError, heartRate(share))
        expect(fused.low, `${share} at ${powerError}`).toBeLessThanOrEqual(fused.value)
        expect(fused.value, `${share} at ${powerError}`).toBeLessThanOrEqual(fused.high)
        expect(fused.value, `${share} at ${powerError}`).toBeGreaterThanOrEqual(alone.value)
        expect(fused.low).toBeGreaterThanOrEqual(alone.low)
        expect(fused.high).toBeGreaterThanOrEqual(alone.high)
      }
    }
    // Heart rate 20% under the power estimate changes nothing at all.
    expect(fuse(POWER, 0.025, heartRate(0.8))).toEqual(fuse(POWER, 0.025, null))
  })

  it('keeps the upper end power alone allows when heart rate lifts the answer', () => {
    const alone = fuse(POWER, 0.025, null)
    // Heart rate 6% over the power estimate, closely read: the answer rises most of the way to it.
    const lifted = fuse(POWER, 0.025, heartRate(1.06, 0.02))
    expect(lifted.value).toBeGreaterThan(alone.value + 0.04 * POWER)
    expect(lifted.low).toBeGreaterThan(alone.low)
    // A range drawn round the heart-rate reading alone would end 7 points lower.
    expect(lifted.high).toBeGreaterThanOrEqual(alone.high)
    // And a large lift still carries its range up with it.
    const far = fuse(POWER, 0.025, heartRate(1.2, 0.03))
    expect(far.value).toBeGreaterThan(1.15 * POWER)
    expect(far.high).toBeGreaterThan(alone.high)
    expect(far.low).toBeLessThan(far.value)
  })

  it('stays at the answer without heart rate where heart rate agrees with the power estimate', () => {
    const { value, low, high } = fuse(POWER, 0.025, heartRate(1))
    expect(value).toBe(fuse(POWER, 0.025, null).value)
    expect(low).toBeLessThan(value)
    expect(high).toBeGreaterThan(value)
  })

  it('trusts a sharper heart rate more', () => {
    const sharp = fuse(POWER, 0.025, heartRate(1.2, 0.02)).value
    const blurred = fuse(POWER, 0.025, heartRate(1.2, 0.08)).value
    expect(sharp).toBeGreaterThan(blurred)
  })

  it('keeps the answer inside the grid of -15% to +45%', () => {
    for (const share of [0.3, 3]) {
      const { low, value, high } = fuse(POWER, 0.025, heartRate(share))
      expect(low).toBeLessThanOrEqual(value)
      expect(value).toBeLessThanOrEqual(high)
      expect(low).toBeGreaterThanOrEqual(POWER * 0.85 - 1e-9)
      expect(high).toBeLessThanOrEqual(POWER * 1.45)
    }
  })

  it('reads a power estimate that is less sure as a wider range downward', () => {
    // Each error has its own kept prior: one keyed without the error would give both the same range.
    const sure = fuse(POWER, 0.025, null)
    const unsure = fuse(POWER, 0.06, null)
    expect(unsure.low).toBeLessThan(sure.low)
    expect(fuse(POWER, 0.025, null).low).toBe(sure.low)
  })

  it('smears the gap prior once for each power error, whatever the power and the heart rate', () => {
    const exp = vi.spyOn(Math, 'exp')
    try {
      // An error no other test uses, so the first call has none kept.
      const first = fuse(POWER, 0.0317, heartRate(1.1))
      const firstCalls = exp.mock.calls.length
      exp.mockClear()
      const second = fuse(180, 0.0317, heartRate(1.2, 0.05))
      expect(firstCalls).toBeGreaterThan(10_000)
      // What is left is the heart-rate likelihood: one exponential for each point of the grid.
      expect(exp.mock.calls.length).toBeLessThan(500)
      // The kept prior is the same one: the second answer scales with the power as the first would.
      expect(fuse(POWER, 0.0317, heartRate(1.1)).value).toBe(first.value)
      expect(second.value / 180).toBeGreaterThan(1)
    } finally {
      exp.mockRestore()
    }
  })
})

/**
 * The range from power alone at exactly `error`: the 10th and 90th percentiles of its posterior, by the plain sum over the gap
 * grid, without the rounding or the cache.
 */
function exactAlone(power: number, error: number) {
  const steps = Math.round((FUSION_GRID.to - FUSION_GRID.from) / FUSION_GRID.step)
  const gaps = Math.round(GAP_PRIOR.largeMax / FUSION_GRID.gapStep)
  const priors = Array.from({ length: gaps }, (_, k) => {
    const g = k * FUSION_GRID.gapStep
    return (
      ((1 - GAP_PRIOR.largeShare) * Math.exp(-g / GAP_PRIOR.smallMean)) / GAP_PRIOR.smallMean +
      GAP_PRIOR.largeShare / GAP_PRIOR.largeMax
    )
  })
  const weights = Array.from({ length: steps }, (_, i) => {
    const x = FUSION_GRID.from + i * FUSION_GRID.step
    let total = 0
    for (let k = 0; k < gaps; k++) {
      const g = k * FUSION_GRID.gapStep
      total += priors[k]! * Math.exp(-0.5 * ((x - g) / error) ** 2)
    }
    return total
  })
  const sum = weights.reduce((a, b) => a + b, 0)
  const at = (share: number) => {
    let seen = 0
    for (let i = 0; i < steps; i++) {
      if ((seen += weights[i]!) >= share * sum)
        return power * (1 + FUSION_GRID.from + i * FUSION_GRID.step)
    }
    return power * (1 + FUSION_GRID.to)
  }
  return { low: at(0.1), high: at(0.9) }
}

describe('reading the power estimate’s error to a step', () => {
  it('is the exact range at a multiple of the step', () => {
    for (const error of [0.025, 0.03, 0.0605, 0.125]) {
      const fused = fuse(POWER, error, null)
      const exact = exactAlone(POWER, error)
      expect(fused.low).toBeCloseTo(exact.low, 9)
      expect(fused.high).toBeCloseTo(exact.high, 9)
    }
  })

  it('moves no end of the range by more than one grid step of the power estimate, over errors from 2.5% to 25%', () => {
    let worst = 0
    let moved = 0
    let total = 0
    // A stride just under one ERROR_STEP lands 6% of a step earlier each time, so it crosses every part of a step without
    // reading every error: the exact sum is slow enough under coverage that a stride of 0.0001 ran past the time limit.
    for (let error = 0.025; error <= 0.25; error += 0.00047) {
      const fused = fuse(POWER, error, null)
      const exact = exactAlone(POWER, error)
      for (const key of ['low', 'high'] as const) {
        const miss = Math.abs(fused[key] - exact[key]) / POWER
        worst = Math.max(worst, miss)
        if (miss > 1e-9) moved++
        total++
      }
    }
    expect(worst).toBeLessThanOrEqual(FUSION_GRID.step + 1e-9)
    // Usually none at all: a percentile sits on a grid point, and up to half a step of error rarely carries it to the next.
    expect(moved / total).toBeLessThan(0.15)
  })

  it('gives errors in the same step the same answer, and a different step another', () => {
    expect(fuse(POWER, 0.025, null)).toEqual(fuse(POWER, 0.025 + ERROR_STEP / 4, null))
    expect(fuse(POWER, 0.025, null)).not.toEqual(fuse(POWER, 0.2, null))
  })
})
