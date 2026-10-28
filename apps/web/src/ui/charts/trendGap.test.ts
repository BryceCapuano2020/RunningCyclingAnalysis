import { DAY_MS } from '@rca/core/constants'
import { describe, expect, it } from 'vitest'
import { GAP_NOTE_MIN_WEEKS, gapNote, longestGap } from './trendGap'

/** Sunday 6 October 2024, UTC, and the Sundays after it. */
const FIRST = Date.UTC(2024, 9, 6, 23, 59, 59, 999)
const ends = (count: number) => Array.from({ length: count }, (_, i) => FIRST + i * 7 * DAY_MS)
const pattern = (...runs: [boolean, number][]) => runs.flatMap(([value, n]) => Array(n).fill(value))

describe('longestGap', () => {
  it('finds a long empty stretch between two valued weeks, and dates it from a window before', () => {
    const has = pattern([true, 5], [false, 20], [true, 5])
    const gap = longestGap(ends(30), has, 84)
    expect(gap).toEqual({ fromMs: ends(30)[5]! - 84 * DAY_MS, toMs: ends(30)[24]! })
  })

  it('takes the longest of several', () => {
    const has = pattern([true, 3], [false, 9], [true, 3], [false, 12], [true, 3])
    expect(longestGap(ends(30), has, 84)?.toMs).toBe(ends(30)[26]!)
  })

  it('has no gap shorter than the minimum, nor one at either end of the trend', () => {
    expect(
      longestGap(ends(30), pattern([true, 10], [false, GAP_NOTE_MIN_WEEKS - 1], [true, 12]), 84),
    ).toBeNull()
    expect(longestGap(ends(30), pattern([false, 15], [true, 15]), 84)).toBeNull()
    expect(longestGap(ends(30), pattern([true, 15], [false, 15]), 84)).toBeNull()
    expect(longestGap(ends(4), pattern([false, 4]), 84)).toBeNull()
  })
})

describe('gapNote', () => {
  it('names the dates, and rides by their power', () => {
    const gap = { fromMs: Date.UTC(2024, 11, 3, 12), toMs: Date.UTC(2025, 7, 17, 23, 59) }
    expect(gapNote('ride', gap)).toBe('No rides with power from 3 Dec 2024 to 17 Aug 2025.')
    expect(gapNote('run', gap)).toBe('No runs from 3 Dec 2024 to 17 Aug 2025.')
  })
})
