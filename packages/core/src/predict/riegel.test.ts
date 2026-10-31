import { describe, expect, it } from 'vitest'
import { HALF_MARATHON_M, RIEGEL_EXPONENT } from '../constants'
import { carried, riegelTime } from './riegel'

describe('Riegel', () => {
  const bests = [
    { distanceM: 5000, seconds: 21 * 60 + 23 },
    { distanceM: 10000, seconds: 42 * 60 + 51 },
  ]

  it('carries a best by the published exponent', () => {
    expect(carried(bests[1]!, 21097.5)).toBeCloseTo(2571 * 2.10975 ** RIEGEL_EXPONENT, 6)
  })

  it('weights the near best most, so a far one only nudges and a lone best is carried as it is', () => {
    const sameDistance = riegelTime(bests, 5000)!
    expect(sameDistance.fromM).toBe(5000)
    // Between the two carried times, nearer the 5 km best's own than the 10 km's.
    const own = bests[0]!.seconds
    const far = carried(bests[1]!, 5000)
    expect(sameDistance.seconds).toBeGreaterThan(Math.min(own, far))
    expect(sameDistance.seconds).toBeLessThan(Math.max(own, far))
    expect(Math.abs(sameDistance.seconds - own)).toBeLessThan(Math.abs(sameDistance.seconds - far))
    const lone = riegelTime([bests[1]!], 5000)!
    expect(lone.seconds).toBeCloseTo(far, 6)
    expect(lone.fromM).toBe(10000)
  })

  it('does not take the fastest implication, which would read every best as all-out', () => {
    // The 10 km implies a faster 5 km than the 5 km best itself; the old rule took that alone.
    const fast = carried(bests[1]!, 5000)
    expect(fast).toBeLessThan(bests[0]!.seconds)
    expect(riegelTime(bests, 5000)!.seconds).toBeGreaterThan(fast)
  })

  it('lets a best far from the race change it little, and one beyond the reach not at all', () => {
    const half = HALF_MARATHON_M
    const tenK = { distanceM: 10_000, seconds: 2571 }
    const alone = riegelTime([tenK], half)!
    const withFive = riegelTime([bests[0]!, tenK], half)!
    expect(withFive).toEqual(alone) // 5 km to the half is over four times: out of reach
    const mile = { distanceM: 1609.344, seconds: 300 }
    expect(riegelTime([tenK, mile], half)).toEqual(alone)
  })

  it('carries no best from further than the reach', () => {
    expect(riegelTime([{ distanceM: 1609.344, seconds: 360 }], 21097.5)).toBeNull()
    expect(riegelTime([{ distanceM: 1609.344, seconds: 360 }], 5000)).not.toBeNull()
    expect(riegelTime([{ distanceM: 5000, seconds: 1300 }], 21097.5)).toBeNull()
    expect(riegelTime([{ distanceM: 5000, seconds: 1300 }], 21097.5, 4.5)).not.toBeNull()
  })
})
