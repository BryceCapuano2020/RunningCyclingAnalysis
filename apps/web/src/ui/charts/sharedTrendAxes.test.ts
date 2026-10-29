import { describe, expect, it } from 'vitest'
import { yDomainOf } from './sharedTrendAxes'

describe('yDomainOf for a grade', () => {
  it('fits the data and its bands with room, snapped to ten-point ticks, not to 0 to 100', () => {
    // Values from 24 to 78 per cent, as a long library's run and ride bands run.
    const { domain, ticks } = yDomainOf([24, 38, 52, 64, 74, 78])
    expect(domain).toEqual([10, 90])
    expect(ticks).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90])
  })

  it('keeps a tight trend at least twenty points tall, with a tick every ten', () => {
    const { domain, ticks } = yDomainOf([62, 63, 64])
    expect(domain[1] - domain[0]).toBeGreaterThanOrEqual(20)
    expect(domain[0] % 10).toBe(0)
    expect(domain[1] % 10).toBe(0)
    expect(domain[0]).toBeLessThanOrEqual(62)
    expect(domain[1]).toBeGreaterThanOrEqual(64)
    expect(ticks.every((t, i) => i === 0 || t - ticks[i - 1]! === 10)).toBe(true)
  })

  it('has the whole scale where there is nothing to fit', () => {
    const { domain, ticks } = yDomainOf([])
    expect(domain).toEqual([0, 100])
    expect(ticks).toHaveLength(11)
  })

  it('never starts under zero, and always takes in every value', () => {
    const { domain } = yDomainOf([2, 9])
    expect(domain[0]).toBe(0)
    for (const values of [
      [41, 59],
      [5, 95],
      [30.4, 30.6],
    ]) {
      const d = yDomainOf(values).domain
      expect(d[0]).toBeLessThanOrEqual(Math.min(...values))
      expect(d[1]).toBeGreaterThanOrEqual(Math.max(...values))
    }
  })
})
