import { describe, expect, it } from 'vitest'
import { weekEndMs } from './trend'
import { weekEndMs as weekEndFromLightModule } from './trendPoints'

describe('weekEndMs', () => {
  const SUNDAY_END = Date.UTC(2025, 0, 12, 23, 59, 59, 999)

  it('ends a Monday-to-Sunday week at the Sunday’s last millisecond, in UTC', () => {
    expect(weekEndMs(Date.UTC(2025, 0, 6, 0, 0, 0, 0))).toBe(SUNDAY_END)
    expect(weekEndMs(Date.UTC(2025, 0, 9, 15))).toBe(SUNDAY_END)
    expect(weekEndMs(SUNDAY_END)).toBe(SUNDAY_END)
  })

  it('starts the next week at the next millisecond', () => {
    expect(weekEndMs(SUNDAY_END + 1)).toBe(SUNDAY_END + 7 * 24 * 3600 * 1000)
  })

  it('is one function, whether read from the trend or from the light module the main thread uses', () => {
    expect(weekEndFromLightModule).toBe(weekEndMs)
  })
})
