import { describe, expect, it } from 'vitest'
import type { Activity } from '../types'
import { encodeGpx } from './encode'

/** Two trackpoints, `metres` apart along a meridian. */
function pair(metres: number): Activity {
  return {
    id: 'pair',
    name: 'pair',
    sport: 'run',
    startMs: Date.UTC(2024, 4, 1, 7, 30),
    n: 2,
    speed: new Float64Array(2),
    distance: Float64Array.from([0, metres]),
    altitude: new Float64Array(2),
    heartRate: new Float64Array(2).fill(NaN),
    power: new Float64Array(2).fill(NaN),
    paused: new Uint8Array(2),
    hasPower: false,
    hasHeartRate: false,
    hasAltitude: true,
    indoor: false,
  }
}

function latitudes(bytes: Uint8Array): number[] {
  const text = new TextDecoder().decode(bytes)
  return [...text.matchAll(/<trkpt lat="([-\d.]+)"/g)].map((m) => Number(m[1]))
}

describe('encodeGpx geometry', () => {
  it('places points one degree of latitude (111.195 km on the IUGG sphere) apart', () => {
    // 2 pi R / 360 for the IUGG mean radius, 6 371 008.8 m: the published 111.195 km per degree.
    const lats = latitudes(encodeGpx(pair(111_195.08)))
    expect(lats).toHaveLength(2)
    expect(lats[1]! - lats[0]!).toBeCloseTo(1, 5)
  })

  it('writes the same bytes for the same noise seed, and different bytes for another seed', () => {
    const activity = pair(1000)
    const a = encodeGpx(activity, { noise: { sigmaM: 2.5, seed: 7 } })
    const b = encodeGpx(activity, { noise: { sigmaM: 2.5, seed: 7 } })
    const c = encodeGpx(activity, { noise: { sigmaM: 2.5, seed: 8 } })
    expect(new TextDecoder().decode(a)).toBe(new TextDecoder().decode(b))
    expect(new TextDecoder().decode(a)).not.toBe(new TextDecoder().decode(c))
  })
})
