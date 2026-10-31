import { describe, expect, it } from 'vitest'
import {
  AUTO_UPDATE_ENABLED,
  BREAKER_FAILURES,
  STEP_TIMEOUT_MS,
  UPDATE_PARALLELISM,
} from './updaterConfig'

describe('the updater configuration', () => {
  it('keeps the automatic updater off until the owner has rebuilt a library by hand', () => {
    // A rebuild cannot be undone. Turning this on is its own change, made on purpose, with this pin.
    expect(AUTO_UPDATE_ENABLED).toBe(false)
  })

  it('keeps the limits the design states', () => {
    expect(BREAKER_FAILURES).toBe(5)
    expect(UPDATE_PARALLELISM).toBe(2)
    expect(STEP_TIMEOUT_MS).toBe(20_000)
  })
})
