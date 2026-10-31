import { describe, expect, it } from 'vitest'
import { METRES_PER_MILE } from '../units'
import { marathonTime } from './marathon'

const tenK = { distanceM: 10000, seconds: 42 * 60 + 51 }

describe('marathonTime', () => {
  it('follows Vickers and Vertosick model 1 from a 10 km and the weekly mileage', () => {
    // Riegel at 1.07 gives 3.519 m/s; model 1 at 18 miles a week gives 3.199 m/s, 3:39:50.
    const riegelSpeed = 42195 / (2571 * (42195 / 10000) ** 1.07)
    const expected = 42195 / (0.16018617 + 0.83076202 * riegelSpeed + 0.06423826 * 1.8)
    expect(marathonTime([tenK], 18 * METRES_PER_MILE)?.seconds).toBeCloseTo(expected, 6)
    expect(marathonTime([tenK], 18 * METRES_PER_MILE)?.fromM).toBe(10000)
  })

  it('is slower than Riegel for a low-mileage runner, and faster with more miles', () => {
    const riegel = 2571 * (42195 / 10000) ** 1.07
    expect(marathonTime([tenK], 18 * METRES_PER_MILE)!.seconds).toBeGreaterThan(riegel)
    expect(marathonTime([tenK], 50 * METRES_PER_MILE)!.seconds).toBeLessThan(
      marathonTime([tenK], 18 * METRES_PER_MILE)!.seconds,
    )
  })

  it('needs a race of 10 km or more, as a 5 km is too far from it to carry', () => {
    expect(marathonTime([{ distanceM: 1609.344, seconds: 360 }], 30000)).toBeNull()
    expect(marathonTime([{ distanceM: 5000, seconds: 1300 }], 30000)).toBeNull()
  })

  it('leads with the half marathon over a 10 km, the nearer race, and names it', () => {
    const half = { distanceM: 21097.5, seconds: 5700 }
    const both = marathonTime([tenK, half], 30000)!
    expect(both.fromM).toBe(21097.5)
    const tenOnly = marathonTime([tenK], 30000)!.seconds
    const halfOnly = marathonTime([half], 30000)!.seconds
    expect(both.seconds).toBeGreaterThan(Math.min(tenOnly, halfOnly))
    expect(both.seconds).toBeLessThan(Math.max(tenOnly, halfOnly))
  })
})
