import { describe, expect, it } from 'vitest'
import { trackFromFixes, type GpsFix } from './gps'

const EARTH_R = 6_371_008.8
const DEG = 180 / Math.PI
const LAT0 = 48
const LON0 = 2
const COS0 = Math.cos((LAT0 * Math.PI) / 180)
const T0 = Date.UTC(2026, 0, 1)
const OPTS = { maxSpeedMs: 12.5 }

/** A fix at second `s`, `northM` metres north of the start and `eastM` east of it. */
function fixAt(s: number, northM: number, eastM = 0): GpsFix {
  return {
    t: T0 + s * 1000,
    lat: LAT0 + (northM / EARTH_R) * DEG,
    lon: LON0 + (eastM / (EARTH_R * COS0)) * DEG,
  }
}

describe('trackFromFixes performance', () => {
  it('processes 200k fixes in under 500 ms', () => {
    const fixes = Array.from({ length: 200_000 }, (_, s) => fixAt(s, 3 * s))
    const start = performance.now()
    trackFromFixes(fixes, OPTS)
    expect(performance.now() - start).toBeLessThan(500)
  })
})
