import { describe, expect, it } from 'vitest'
import { BREAKER_FAILURES, STEP_TIMEOUT_MS, UPDATE_PARALLELISM } from './updaterConfig'

describe('the updater configuration', () => {
  it('keeps the limits the design states', () => {
    expect(BREAKER_FAILURES).toBe(5)
    expect(UPDATE_PARALLELISM).toBe(2)
    expect(STEP_TIMEOUT_MS).toBe(20_000)
  })
})
