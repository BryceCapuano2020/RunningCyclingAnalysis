import { describe, expect, it } from 'vitest'
import { workoutKey } from './duplicates'

describe('workoutKey', () => {
  it('is the sport and the start rounded to the nearest second, half up', () => {
    expect(workoutKey('ride', 1_499)).toBe('ride-1')
    expect(workoutKey('ride', 1_500)).toBe('ride-2')
    expect(workoutKey('run', 2_499)).toBe('run-2')
    expect(workoutKey('run', 1_700_000_000_000)).toBe('run-1700000000')
  })

  it('names two copies a few hundred milliseconds apart alike, and copies a second or more apart differently', () => {
    expect(workoutKey('run', 10_100)).toBe(workoutKey('run', 10_400))
    expect(workoutKey('run', 10_400)).not.toBe(workoutKey('run', 11_400))
    expect(workoutKey('run', 10_000)).not.toBe(workoutKey('ride', 10_000))
  })
})
