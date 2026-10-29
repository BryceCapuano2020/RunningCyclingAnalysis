import { describe, expect, it } from 'vitest'
import type { RawRecord } from '../fit/resample'
import { cleanRecord } from './cleanRecord'

describe('cleanRecord', () => {
  it('counts impossible speed, heart rate and power values', () => {
    const drops = new Map<RawRecord, number>()
    const cleaned = cleanRecord(
      { tMs: 0, speed: 99, heartRate: 300, power: 5000, altitude: 10 },
      12.5,
      drops,
    )
    expect(cleaned).toMatchObject({ speed: undefined, heartRate: undefined, power: undefined })
    expect(drops.get(cleaned)).toBe(3)
  })

  it('drops impossible cadence and temperature without counting them', () => {
    const drops = new Map<RawRecord, number>()
    const cleaned = cleanRecord({ tMs: 0, cadence: 900, temperature: 400 }, 30, drops)
    expect(cleaned.cadence).toBeUndefined()
    expect(cleaned.temperature).toBeUndefined()
    expect(drops.size).toBe(0)
    const kept = cleanRecord({ tMs: 1, cadence: 85, temperature: 20 }, 30, drops)
    expect(kept).toMatchObject({ cadence: 85, temperature: 20 })
  })

  it('drops an impossible altitude without counting it', () => {
    const drops = new Map<RawRecord, number>()
    for (const altitude of [1e39, -1e39, 25_000, -5000, Infinity, NaN]) {
      expect(cleanRecord({ tMs: 0, altitude }, 30, drops).altitude).toBeUndefined()
    }
    for (const altitude of [-400, 0, 3500, 8849]) {
      expect(cleanRecord({ tMs: 0, altitude }, 30, drops).altitude).toBe(altitude)
    }
    expect(drops.size).toBe(0)
  })
})
