import { describe, expect, it, vi } from 'vitest'
import { fuse } from './fusion'

const POWER = 250
const heartRate = (share: number, relativeError = 0.04) => ({
  value: POWER * share,
  relativeError,
})

describe('fusing the power estimate with heart rate', () => {
  it('with no heart rate puts the answer about 3% over the power estimate', () => {
    const { value, low, high } = fuse(POWER, 0.025, null)
    expect(value / POWER).toBeGreaterThan(1.02)
    expect(value / POWER).toBeLessThan(1.045)
    expect(low).toBeLessThan(value)
    expect(high).toBeGreaterThan(value)
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
    // Heart rate 6% over the power estimate, closely read: the answer rises 1.6 points.
    const lifted = fuse(POWER, 0.025, heartRate(1.06, 0.02))
    expect(lifted.value).toBeGreaterThan(alone.value + 0.01 * POWER)
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
