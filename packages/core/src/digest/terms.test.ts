import { describe, expect, it } from 'vitest'
import { DRIVETRAIN_EFFICIENCY, G, RHO_AIR } from '../constants'
import { airDensity } from '../physics/air'
import { estimatePower } from '../virtualPower'
import { powerAt, sampleTerms, termsOver } from './terms'

const MODEL = { crr: 0.005, cda: 0.3 }

describe('sampleTerms', () => {
  it('gives only rolling and aero terms on the flat at constant speed', () => {
    const terms = sampleTerms(new Float64Array(3).fill(10), new Float64Array(3))
    expect(terms.gravityAccel[1]).toBeCloseTo(0, 12)
    expect(terms.rolling[1]).toBeCloseTo(G * 10, 12)
    expect(terms.aero[1]).toBeCloseTo(0.5 * RHO_AIR * 1000, 12)
  })

  it('scales the aero term with the per-sample air density', () => {
    const speed = new Float64Array(3).fill(10)
    const grade = new Float64Array(3)
    const density = Float64Array.from([RHO_AIR, airDensity(2000), airDensity(2000)])
    const terms = sampleTerms(speed, grade, density)
    expect(terms.aero[0]).toBeCloseTo(0.5 * RHO_AIR * 1000, 12)
    expect(terms.aero[1]! / terms.aero[0]!).toBeCloseTo(airDensity(2000) / RHO_AIR, 12)
    expect(terms.rolling[1]).toBeCloseTo(G * 10, 12)
  })

  it('uses the sine of the gradient for the gravity term', () => {
    const terms = sampleTerms(new Float64Array(3).fill(10), new Float64Array(3).fill(0.1))
    expect(terms.gravityAccel[1]).toBeCloseTo(G * Math.sin(Math.atan(0.1)) * 10, 12)
    expect(terms.rolling[1]).toBeCloseTo(G * Math.cos(Math.atan(0.1)) * 10, 12)
  })

  it('adds the acceleration to the gravity term', () => {
    // Speed rises by 1 m/s each second, so the centred acceleration is 1 m/s^2 in the interior.
    const speed = Float64Array.from({ length: 20 }, (_, i) => 5 + i)
    const terms = sampleTerms(speed, new Float64Array(20))
    expect(terms.gravityAccel[10]).toBeCloseTo(speed[10]!, 9)
  })
})

describe('termsOver and powerAt', () => {
  it('averages the terms over a window', () => {
    const terms = sampleTerms(Float64Array.from([2, 4, 6, 8, 10]), new Float64Array(5))
    const window = termsOver(terms, 1, 4)
    expect(window.rolling).toBeCloseTo((G * (4 + 6 + 8)) / 3, 9)
    expect(window.aero).toBeCloseTo((0.5 * RHO_AIR * (64 + 216 + 512)) / 3, 9)
  })

  it('reproduces the mechanical power of estimatePower for a steady stretch', () => {
    const speed = new Float64Array(60).fill(8)
    const grade = new Float64Array(60).fill(0.05)
    const mass = 84
    const direct = estimatePower(speed, grade, mass, MODEL)[30]!
    const window = termsOver(sampleTerms(speed, grade), 0, 60)
    expect(powerAt(window, mass, MODEL)).toBeCloseTo(direct, 9)
  })

  it('evaluates a known flat case by hand', () => {
    // 10 m/s on the flat: rolling = G * 10, aero = 612.5. P = (100 * 0.005 * G * 10 + 0.3 * 612.5) / 0.975.
    const terms = { gravityAccel: 0, rolling: G * 10, aero: 612.5 }
    expect(powerAt(terms, 100, MODEL)).toBeCloseTo(
      (100 * 0.005 * G * 10 + 0.3 * 612.5) / DRIVETRAIN_EFFICIENCY,
      9,
    )
  })
})
