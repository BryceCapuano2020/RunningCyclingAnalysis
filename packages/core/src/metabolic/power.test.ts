import { describe, expect, it } from 'vitest'
import { minettiCost, runMetabolicPower } from './power'

describe('minettiCost', () => {
  it('equals the flat running cost at zero grade', () => {
    expect(minettiCost(0)).toBeCloseTo(3.6, 12)
  })

  it('matches the hand-computed value at +10% and -10%', () => {
    expect(minettiCost(0.1)).toBeCloseTo(5.968214, 9)
    expect(minettiCost(-0.1)).toBeCloseTo(2.151706, 9)
  })

  it('matches the hand-computed value at the fitted limit', () => {
    expect(minettiCost(0.45)).toBeCloseTo(19.426015, 5)
    expect(minettiCost(-0.45)).toBeCloseTo(4.032305, 5)
  })

  it('clamps the gradient to plus or minus 0.45', () => {
    expect(minettiCost(0.9)).toBeCloseTo(19.426015, 5)
    expect(minettiCost(-0.9)).toBeCloseTo(4.032305, 5)
  })
})

describe('runMetabolicPower', () => {
  it('returns resting rate below 0.5 m/s and the Minetti cost above it', () => {
    const speed = Float64Array.from([0, 0.4, 0.5, 4, NaN])
    const grade = new Float64Array(5)
    const out = runMetabolicPower(speed, grade)
    expect(out[0]).toBe(1.22)
    expect(out[1]).toBe(1.22)
    expect(out[2]).toBeCloseTo(3.02, 10)
    expect(out[3]).toBeCloseTo(15.62, 10)
    expect(out[4]).toBeNaN()
  })

  it('scales the running cost by economyScale', () => {
    const out = runMetabolicPower(Float64Array.from([4]), Float64Array.from([0]), 1.1)
    expect(out[0]).toBeCloseTo(17.06, 10)
  })

  it('uses the gradient of each sample', () => {
    const out = runMetabolicPower(Float64Array.from([3]), Float64Array.from([0.1]))
    expect(out[0]).toBeCloseTo(1.22 + 5.968214 * 3, 9)
  })

  it('clamps extreme gradients in the cost', () => {
    const up = runMetabolicPower(Float64Array.from([2]), Float64Array.from([0.9]))
    expect(up[0]).toBeCloseTo(40.072029125, 9)
    const down = runMetabolicPower(Float64Array.from([2]), Float64Array.from([-0.9]))
    expect(down[0]).toBeCloseTo(9.284610875, 9)
  })

  it('returns an empty array for empty input', () => {
    expect(runMetabolicPower(new Float64Array(0), new Float64Array(0)).length).toBe(0)
  })
})
