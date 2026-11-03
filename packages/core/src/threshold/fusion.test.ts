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

  it('follows heart rate less than half the way down', () => {
    // Heart rate says 20% under the power estimate; the power estimate is a floor, so the answer moves under it only a little.
    const down = fuse(POWER, 0.025, heartRate(0.8)).value / POWER
    expect(down).toBeGreaterThan(0.9)
    expect(down).toBeLessThan(1)
  })

  it('gives way further when the power estimate is the less sure', () => {
    const sure = fuse(POWER, 0.025, heartRate(0.8)).value
    const unsure = fuse(POWER, 0.06, heartRate(0.8)).value
    expect(unsure).toBeLessThan(sure - 5)
  })

  it('stays near the power estimate where heart rate agrees', () => {
    const { value, low, high } = fuse(POWER, 0.025, heartRate(1))
    expect(Math.abs(value / POWER - 1)).toBeLessThan(0.02)
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
      const { low, high } = fuse(POWER, 0.025, heartRate(share))
      expect(low).toBeGreaterThanOrEqual(POWER * 0.85 - 1e-9)
      expect(high).toBeLessThanOrEqual(POWER * 1.45)
    }
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
