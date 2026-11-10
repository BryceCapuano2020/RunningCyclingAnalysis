import { describe, expect, it } from 'vitest'
import { zoneNamed } from './zone.ts'

const at = (iso: string) => Date.parse(iso)

describe('zoneNamed', () => {
  it.each([
    ['UTC', '2026-07-01T12:00:00Z', 0],
    ['America/Los_Angeles', '2026-01-15T12:00:00Z', -480],
    ['America/Los_Angeles', '2026-07-15T12:00:00Z', -420],
    ['Pacific/Auckland', '2026-01-15T12:00:00Z', 780],
    ['Pacific/Auckland', '2026-07-15T12:00:00Z', 720],
    ['Asia/Kolkata', '2026-07-15T12:00:00Z', 330],
    ['Etc/GMT+7', '2026-07-15T12:00:00Z', -420],
  ])('%s at %s is %i minutes east of UTC', (name, iso, minutes) => {
    expect(zoneNamed(name)(at(iso))).toBe(minutes)
  })

  it('changes at the instant the clocks do, not a quarter hour later', () => {
    // Clocks go forward in Los Angeles at 10:00 UTC on 8 March 2026.
    const zone = zoneNamed('America/Los_Angeles')
    expect(zone(at('2026-03-08T09:59:59Z'))).toBe(-480)
    expect(zone(at('2026-03-08T10:00:00Z'))).toBe(-420)
    expect(zone(at('2026-11-01T08:59:59Z'))).toBe(-420)
    expect(zone(at('2026-11-01T09:00:00Z'))).toBe(-480)
  })

  it('refuses a name that is not a zone', () => {
    expect(() => zoneNamed('Not/AZone')).toThrow()
  })
})
