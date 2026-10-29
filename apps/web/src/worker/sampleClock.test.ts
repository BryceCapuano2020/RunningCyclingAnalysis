import { afterEach, describe, expect, it, vi } from 'vitest'
import { SAMPLE_REFERENCE_NOW_MS, generateSampleActivity, samplePlan } from '@rca/core/synthetic'
import { deviceClock, sampleActivityById } from './sampleClock'

afterEach(() => {
  vi.useRealTimers()
})

describe('deviceClock', () => {
  it('reads the present and the device’s own zone, east of UTC being positive', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(SAMPLE_REFERENCE_NOW_MS)
    const clock = deviceClock()
    expect(clock.nowMs).toBe(SAMPLE_REFERENCE_NOW_MS)
    expect(clock.utcOffsetMinutes?.(SAMPLE_REFERENCE_NOW_MS)).toBe(
      -new Date(SAMPLE_REFERENCE_NOW_MS).getTimezoneOffset(),
    )
  })
})

describe('sampleActivityById', () => {
  const clock = { nowMs: SAMPLE_REFERENCE_NOW_MS }

  it('draws the recording the season holds under an id, as loading the sample drew it', () => {
    const entry = samplePlan(clock)[5]!
    const drawn = sampleActivityById(clock, entry.spec.id)
    expect(drawn?.id).toBe(entry.spec.id)
    expect(drawn?.speed).toEqual(generateSampleActivity(entry).speed)
  })

  it('finds nothing for an id the season does not hold', () => {
    expect(sampleActivityById(clock, 'not-in-the-season')).toBeUndefined()
  })
})
