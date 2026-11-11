import { describe, expect, it } from 'vitest'
import { MIB } from '../constants'
import { DEFAULT_PARSE_LIMITS, GARMIN_PARSE_LIMITS } from './index'

describe('GARMIN_PARSE_LIMITS', () => {
  it('caps a file at the push limit, 5 MiB', () => {
    expect(GARMIN_PARSE_LIMITS.maxFileBytes).toBe(5 * MIB)
  })

  it('is under the browser limits on every field', () => {
    for (const key of Object.keys(DEFAULT_PARSE_LIMITS) as (keyof typeof DEFAULT_PARSE_LIMITS)[]) {
      expect(GARMIN_PARSE_LIMITS[key], key).toBeLessThan(DEFAULT_PARSE_LIMITS[key])
    }
  })

  it('still reads one long activity: 36 hours at one record a second', () => {
    expect(GARMIN_PARSE_LIMITS.maxActivitySeconds).toBe(36 * 3600)
    expect(GARMIN_PARSE_LIMITS.maxRecordMessages).toBeGreaterThanOrEqual(36 * 3600)
  })
})
