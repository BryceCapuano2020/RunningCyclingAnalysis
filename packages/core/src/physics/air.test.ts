import { describe, expect, it } from 'vitest'
import { RHO_AIR } from '../constants'
import { airDensity, airDensityStream } from './air'

const stream = (
  altitude: number[],
  overrides: { hasAltitude?: boolean; indoor?: boolean } = {},
) => ({
  n: altitude.length,
  altitude: Float64Array.from(altitude),
  hasAltitude: overrides.hasAltitude ?? true,
  indoor: overrides.indoor ?? false,
})

describe('airDensity', () => {
  it('is the sea-level constant at 0 m', () => {
    expect(airDensity(0)).toBe(RHO_AIR)
  })

  it('follows the ISA troposphere at 1,000 m and 2,000 m', () => {
    expect(airDensity(1000) / 1.112).toBeCloseTo(1, 2)
    expect(airDensity(2000) / 1.007).toBeCloseTo(1, 2)
  })

  it('falls with altitude', () => {
    expect(airDensity(500)).toBeGreaterThan(airDensity(1000))
    expect(airDensity(2000)).toBeLessThan(airDensity(1000))
  })

  it('falls back to sea level for NaN and other non-finite altitudes', () => {
    expect(airDensity(NaN)).toBe(RHO_AIR)
    expect(airDensity(Infinity)).toBe(RHO_AIR)
    expect(airDensity(-Infinity)).toBe(RHO_AIR)
  })

  it('treats altitude outside [-500, 9000] m as missing, not clamped', () => {
    expect(airDensity(-5000)).toBe(RHO_AIR)
    expect(airDensity(20000)).toBe(RHO_AIR)
    expect(airDensity(9001)).toBe(RHO_AIR)
    expect(airDensity(-501)).toBe(RHO_AIR)
  })

  it('keeps the bounds themselves as valid altitudes', () => {
    expect(airDensity(-500)).toBeGreaterThan(RHO_AIR)
    expect(airDensity(9000)).toBeLessThan(airDensity(2000))
  })
})

describe('airDensityStream', () => {
  it('follows each sample of an outdoor activity with altitude', () => {
    const density = airDensityStream(stream([0, 1000, 2000]))
    expect(density[0]).toBe(RHO_AIR)
    expect(density[1]).toBe(airDensity(1000))
    expect(density[2]).toBe(airDensity(2000))
  })

  it('uses sea level for every sample when there is no altitude', () => {
    const density = airDensityStream(stream([2000, 2000], { hasAltitude: false }))
    expect(Array.from(density)).toEqual([RHO_AIR, RHO_AIR])
  })

  it('uses sea level for every sample of an indoor activity', () => {
    const density = airDensityStream(stream([2000, 2000], { indoor: true }))
    expect(Array.from(density)).toEqual([RHO_AIR, RHO_AIR])
  })

  it('gives a missing sample the median valid altitude', () => {
    const density = airDensityStream(stream([1000, NaN, 3000, 2000]))
    expect(density[1]).toBe(airDensity(2000))
    expect(density[2]).toBe(airDensity(3000))
  })

  it('gives every sample sea level when no altitude sample is valid', () => {
    const density = airDensityStream(stream([NaN, NaN]))
    expect(Array.from(density)).toEqual([RHO_AIR, RHO_AIR])
  })

  it('leaves out-of-range altitudes out of the median and fills them', () => {
    const density = airDensityStream(stream([1000, 20000, 3000, 2000, -5000]))
    expect(density[1]).toBe(airDensity(2000))
    expect(density[4]).toBe(airDensity(2000))
  })

  it('leaves samples the quality mask excludes out of the median and fills them', () => {
    // Including the two masked 6000 m samples would make the median 3500 m.
    const altitude = [1000, 1000, 6000, 6000, NaN]
    const valid = Uint8Array.from([1, 1, 0, 0, 1])
    const density = airDensityStream(stream(altitude), valid)
    expect(density[2]).toBe(airDensity(1000))
    expect(density[3]).toBe(airDensity(1000))
    expect(density[4]).toBe(airDensity(1000))
    expect(density[0]).toBe(airDensity(1000))
  })
})
