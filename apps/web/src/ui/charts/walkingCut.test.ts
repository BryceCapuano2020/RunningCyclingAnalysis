import { describe, expect, it } from 'vitest'
import { WALKING_PACE } from '@rca/core/constants'
import { drawnCount } from './walkingCut'

const LIMIT = WALKING_PACE.maxMovingSpeedMs

describe('drawnCount', () => {
  it('keeps a run curve through the longest duration that is not at walking pace', () => {
    // 5 min, 20 min, 1 h, 2 h, 3 h: the last two are slower than the walking-pace limit.
    expect(drawnCount('run', [4, 3.6, 3.2, LIMIT - 0.1, LIMIT - 0.3])).toBe(3)
  })

  it('keeps a value exactly at the limit, since the digest sets aside only a speed under it', () => {
    expect(drawnCount('run', [4, 3.2, LIMIT, LIMIT - 0.01])).toBe(3)
  })

  it('keeps the whole curve when no value is slower than the limit', () => {
    expect(drawnCount('run', [4, 3.6, 3.2, 2.5])).toBe(4)
  })

  it('draws none of a run curve that never gets above walking pace', () => {
    expect(drawnCount('run', [LIMIT - 0.2, LIMIT - 0.4])).toBe(0)
  })

  it('skips a missing value and counts through the last one that qualifies', () => {
    expect(drawnCount('run', [4, null, 3.2, undefined, NaN, LIMIT - 0.5])).toBe(3)
  })

  it('never cuts a ride, however low its power', () => {
    expect(drawnCount('ride', [300, 220, 80, 5])).toBe(4)
  })
})
