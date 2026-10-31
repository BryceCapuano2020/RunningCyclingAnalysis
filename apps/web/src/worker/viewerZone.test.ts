import { describe, expect, it } from 'vitest'
import { deviceZone } from './viewerZone'

describe('deviceZone', () => {
  it('is minutes east of UTC at the instant asked, as the device’s own clock has it', () => {
    for (const ms of [Date.UTC(2026, 0, 15, 12), Date.UTC(2026, 6, 15, 12)]) {
      expect(deviceZone(ms)).toBe(-new Date(ms).getTimezoneOffset())
    }
  })
})
