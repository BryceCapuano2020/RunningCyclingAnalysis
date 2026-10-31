import { describe, expect, it } from 'vitest'
import { FLAT_RUN_COST, RUN_COST_CORRECTION } from '../constants'
import { RESTING_W_PER_KG } from '../constants'
import {
  DESCENT_COST_FLOOR_GRADE,
  descentCost,
  minettiCost,
  runCost,
  runMetabolicPower,
  STEEP_DESCENT_CREDIT,
  STEEP_DESCENT_GRADE,
} from './power'

describe('runCost', () => {
  it('is Minetti plus the same level correction at every gradient', () => {
    for (const g of [-0.1, 0, 0.05, 0.1]) {
      expect(runCost(g) - minettiCost(g)).toBeCloseTo(RUN_COST_CORRECTION, 12)
    }
  })

  it('equals the flat running cost at zero grade', () => {
    expect(runCost(0)).toBeCloseTo(FLAT_RUN_COST, 12)
    expect(FLAT_RUN_COST).toBeCloseTo(3.9, 12)
  })
})

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
  it('returns resting rate below 0.5 m/s and the corrected cost above it', () => {
    const speed = Float64Array.from([0, 0.4, 0.5, 4, NaN])
    const grade = new Float64Array(5)
    const out = runMetabolicPower(speed, grade)
    expect(out[0]).toBe(1.22)
    expect(out[1]).toBe(1.22)
    expect(out[2]).toBeCloseTo(3.17, 10)
    expect(out[3]).toBeCloseTo(16.82, 10)
    expect(out[4]).toBeNaN()
  })

  it('scales the running cost by economyScale', () => {
    const out = runMetabolicPower(Float64Array.from([4]), Float64Array.from([0]), 1.1)
    expect(out[0]).toBeCloseTo(18.38, 10)
  })

  it('uses the gradient of each sample', () => {
    const out = runMetabolicPower(Float64Array.from([3]), Float64Array.from([0.1]))
    expect(out[0]).toBeCloseTo(1.22 + (5.968214 + RUN_COST_CORRECTION) * 3, 9)
  })

  it('clamps extreme gradients in the cost', () => {
    const up = runMetabolicPower(Float64Array.from([2]), Float64Array.from([0.9]))
    expect(up[0]).toBeCloseTo(40.672029125, 9)
    const down = runMetabolicPower(Float64Array.from([2]), Float64Array.from([-0.9]))
    expect(down[0]).toBeCloseTo(9.884610875, 9)
  })

  it('returns an empty array for empty input', () => {
    expect(runMetabolicPower(new Float64Array(0), new Float64Array(0)).length).toBe(0)
  })
})

describe('descentCost', () => {
  const grades = Array.from({ length: 901 }, (_, i) => -0.45 + i / 1000)

  it('is runCost at and above -4%', () => {
    for (const g of grades.filter((g) => g >= STEEP_DESCENT_GRADE)) {
      expect(descentCost(g)).toBe(runCost(g))
    }
  })

  it('is continuous at -4%', () => {
    expect(descentCost(STEEP_DESCENT_GRADE - 1e-9)).toBeCloseTo(runCost(STEEP_DESCENT_GRADE), 6)
  })

  it('takes the credited share of the further saving below -4%', () => {
    const edge = runCost(STEEP_DESCENT_GRADE)
    for (const g of [-0.06, -0.1, -0.15, DESCENT_COST_FLOOR_GRADE]) {
      expect(descentCost(g)).toBeCloseTo(edge - STEEP_DESCENT_CREDIT * (edge - runCost(g)), 12)
      // Less saving than the polynomial, more than none.
      expect(descentCost(g)).toBeGreaterThan(runCost(g))
      expect(descentCost(g)).toBeLessThan(edge)
    }
  })

  it('never rises as the descent steepens, from -4% to -45%', () => {
    let previous = descentCost(STEEP_DESCENT_GRADE)
    for (const g of grades.filter((g) => g < STEEP_DESCENT_GRADE).reverse()) {
      const cost = descentCost(g)
      expect(cost, `${g}`).toBeLessThanOrEqual(previous + 1e-12)
      previous = cost
    }
  })

  it('holds the value of -18% for every steeper grade: the polynomial turns back up there', () => {
    const floor = descentCost(DESCENT_COST_FLOOR_GRADE)
    expect(runCost(-0.3)).toBeGreaterThan(runCost(DESCENT_COST_FLOOR_GRADE))
    for (const g of grades.filter((g) => g < DESCENT_COST_FLOOR_GRADE)) {
      expect(descentCost(g)).toBe(floor)
    }
  })

  it('leaves an unknown grade unknown', () => {
    expect(descentCost(NaN)).toBeNaN()
  })
})

describe('runMetabolicPower with the steep-descent saving', () => {
  const speed = new Float64Array([3, 3, 3, 3]).fill(3)
  const grade = Float64Array.from([0.05, -0.02, -0.1, -0.3])

  it('is the plain model when the option is absent or false', () => {
    const plain = runMetabolicPower(speed, grade)
    expect(Array.from(runMetabolicPower(speed, grade, 1, {}))).toEqual(Array.from(plain))
    expect(Array.from(runMetabolicPower(speed, grade, 1, { steepDescent: false }))).toEqual(
      Array.from(plain),
    )
  })

  it('changes only the samples below -4%', () => {
    const plain = runMetabolicPower(speed, grade, 1.1)
    const steep = runMetabolicPower(speed, grade, 1.1, { steepDescent: true })
    expect(steep[0]).toBe(plain[0])
    expect(steep[1]).toBe(plain[1])
    expect(steep[2]).toBeCloseTo(RESTING_W_PER_KG + 1.1 * descentCost(-0.1) * 3, 12)
    expect(steep[2]!).toBeGreaterThan(plain[2]!)
    expect(steep[3]).toBeCloseTo(RESTING_W_PER_KG + 1.1 * descentCost(-0.18) * 3, 12)
  })
})
