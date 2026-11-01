import { describe, expect, it } from 'vitest'
import '../test/deviceZone'
import {
  entryAt,
  isLocalDate,
  localDateOf,
  measurementKey,
  withEntry,
  withoutEntry,
} from './measurements'
import type { Measurement } from './measurements'

const local = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).getTime()

const hr = (sport: 'run' | 'ride', value: number, from: string): Measurement => ({
  kind: 'maxHeartRate',
  sport,
  value,
  from,
})

describe('dates', () => {
  it('accepts only real calendar dates written YYYY-MM-DD', () => {
    expect(isLocalDate('2024-02-29')).toBe(true)
    expect(isLocalDate('2023-02-29')).toBe(false)
    expect(isLocalDate('2024-13-01')).toBe(false)
    expect(isLocalDate('24-01-01')).toBe(false)
    expect(isLocalDate('2024-1-1')).toBe(false)
  })

  it('reads an instant as its local date', () => {
    expect(localDateOf(local(2024, 3, 9, 0))).toBe('2024-03-09')
    expect(localDateOf(local(2024, 3, 9, 23))).toBe('2024-03-09')
  })
})

describe('entryAt', () => {
  const entries = [
    hr('run', 188, '2023-01-01'),
    hr('run', 184, '2025-01-01'),
    hr('ride', 178, '2024-01-01'),
  ]

  it('finds the latest entry that starts on or before the date, per sport', () => {
    expect(entryAt(entries, 'maxHeartRate', 'run', local(2024, 6, 1))?.value).toBe(188)
    expect(entryAt(entries, 'maxHeartRate', 'run', local(2025, 1, 1, 0))?.value).toBe(184)
    expect(entryAt(entries, 'maxHeartRate', 'ride', local(2030, 1, 1))?.value).toBe(178)
  })

  it('applies the earliest entry before the first, and none when there is none', () => {
    expect(entryAt(entries, 'maxHeartRate', 'run', local(2010, 1, 1))?.value).toBe(188)
    expect(entryAt(entries, 'thresholdPower', 'ride', local(2024, 1, 1))).toBeNull()
  })
})

describe('editing entries', () => {
  it('names an entry by kind, sport and date', () => {
    expect(measurementKey({ kind: 'massKg', from: '2024-05-01' })).toBe('massKg.2024-05-01')
    expect(measurementKey(hr('run', 188, '2024-05-01'))).toBe('maxHeartRate.run.2024-05-01')
  })

  it('replaces an entry for the same date and removes one by its key', () => {
    const start = [hr('run', 188, '2024-05-01'), hr('ride', 178, '2024-05-01')]
    const replaced = withEntry(start, hr('run', 186, '2024-05-01'))
    expect(replaced.map((entry) => entry.value).sort()).toEqual([178, 186])
    expect(withoutEntry(replaced, 'maxHeartRate.run.2024-05-01')).toEqual([
      hr('ride', 178, '2024-05-01'),
    ])
  })
})
