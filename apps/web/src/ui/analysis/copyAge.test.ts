import { describe, expect, it } from 'vitest'
import { copyIsStale } from './copyAge'

const MADE = Date.UTC(2026, 5, 1, 12)

describe('a copy made on an earlier local day', () => {
  it('is fresh on the same local day, in the zone it was made in', () => {
    expect(copyIsStale({ nowMs: MADE, zone: 'UTC' }, MADE + 11 * 3_600_000, 'UTC')).toBe(false)
  })

  it('is stale once the local day has turned, however little time has passed', () => {
    expect(copyIsStale({ nowMs: MADE, zone: 'UTC' }, MADE + 12 * 3_600_000, 'UTC')).toBe(true)
  })

  it('cuts the day in the viewer zone, not UTC', () => {
    // 12:00 UTC is 05:00 in Los Angeles; 12 hours later is still the same Los Angeles day.
    const zone = 'America/Los_Angeles'
    expect(copyIsStale({ nowMs: MADE, zone }, MADE + 12 * 3_600_000, zone)).toBe(false)
    expect(copyIsStale({ nowMs: MADE, zone }, MADE + 19 * 3_600_000, zone)).toBe(true)
  })

  it('is stale when the browser is in another zone than the copy was made in', () => {
    expect(copyIsStale({ nowMs: MADE, zone: 'UTC' }, MADE, 'Asia/Tokyo')).toBe(true)
  })
})
