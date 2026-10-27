import { describe, expect, it } from 'vitest'
import { danielsTime, oxygenCost, sustainableShare, vdotOf } from './daniels'

// Daniels' Running Formula's VDOT 50 row: 5 km 19:57, 10 km 41:21, half 1:31:35, marathon 3:10:49.
const VDOT_50: [number, number][] = [
  [5_000, 19 * 60 + 57],
  [10_000, 41 * 60 + 21],
  [21_097.5, 91 * 60 + 35],
  [42_195, 190 * 60 + 49],
]

describe('Daniels and Gilbert', () => {
  it('gives the published VDOT 50 race times within 0.5%', () => {
    for (const [distanceM, seconds] of VDOT_50) {
      expect(Math.abs(danielsTime(distanceM, 50) / seconds - 1)).toBeLessThan(0.005)
    }
  })

  it('reads the VDOT back from a race it predicts', () => {
    expect(vdotOf(10_000, danielsTime(10_000, 55))).toBeCloseTo(55, 6)
  })

  it('costs more oxygen the faster the pace, and holds a smaller share the longer the race', () => {
    expect(oxygenCost(300)).toBeGreaterThan(oxygenCost(250))
    expect(sustainableShare(120)).toBeLessThan(sustainableShare(20))
    expect(sustainableShare(11)).toBeCloseTo(1, 1)
  })
})
