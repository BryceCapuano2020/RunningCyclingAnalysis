import { describe, expect, it } from 'vitest'
import { RIEGEL_EXPONENT } from '../constants'
import { carried, riegelTime } from './riegel'

describe('Riegel', () => {
  const bests = [
    { distanceM: 5000, seconds: 21 * 60 + 23 },
    { distanceM: 10000, seconds: 42 * 60 + 51 },
  ]

  it('carries a best by the published exponent', () => {
    expect(carried(bests[1]!, 21097.5)).toBeCloseTo(2571 * 2.10975 ** RIEGEL_EXPONENT, 6)
  })

  it('takes the best that implies the fastest time, since a best is a lower bound', () => {
    // The 10 km implies a faster 5 km than the 5 km best itself, which was not all-out.
    expect(riegelTime(bests, 5000)).toEqual({ seconds: carried(bests[1]!, 5000), fromM: 10000 })
    expect(riegelTime(bests, 5000)!.seconds).toBeLessThan(bests[0]!.seconds)
  })

  it('carries no best from more than ten times away', () => {
    expect(riegelTime([{ distanceM: 1609.344, seconds: 360 }], 21097.5)).toBeNull()
  })
})
