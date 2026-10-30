import { describe, expect, it } from 'vitest'
import { workoutKey } from './duplicates'
import { isSameWorkout } from './duplicates'

describe('isSameWorkout', () => {
  const run = { sport: 'run', startMs: 0, durationS: 3600 } as const

  it('treats starts exactly 60 s apart as one workout, and 60.001 s as two', () => {
    expect(isSameWorkout(run, { ...run, startMs: 60_000 })).toBe(true)
    expect(isSameWorkout(run, { ...run, startMs: -60_000 })).toBe(true)
    expect(isSameWorkout(run, { ...run, startMs: 60_001 })).toBe(false)
  })

  it('compares durations within 60 s or 10 percent of the longer', () => {
    expect(isSameWorkout(run, { ...run, durationS: 3660 })).toBe(true)
    // A gap of 400 s is exactly 10 percent of the longer, 4000 s.
    expect(isSameWorkout(run, { ...run, durationS: 4000 })).toBe(true)
    expect(isSameWorkout(run, { ...run, durationS: 4001 })).toBe(false)
    expect(isSameWorkout({ ...run, durationS: 100 }, { ...run, durationS: 160 })).toBe(true)
    expect(isSameWorkout({ ...run, durationS: 100 }, { ...run, durationS: 161 })).toBe(false)
  })

  it('never joins two sports', () => {
    expect(isSameWorkout(run, { ...run, sport: 'ride' })).toBe(false)
  })
})

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
