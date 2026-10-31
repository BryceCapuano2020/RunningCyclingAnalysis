import { describe, expect, it } from 'vitest'
import type { RunPredictions } from '@rca/core/predict'
import { makeActivity } from '../components/fixtures'
import { ranBests, ranText } from './raceRan'

const OPENED = new Date(2026, 10, 30, 12).getTime()

const found = {
  races: [
    { distanceM: 5000, seconds: 1200, low: 1140, high: 1290, methods: [] },
    { distanceM: 10000, seconds: 2443, low: 2350, high: 2560, methods: [] },
  ],
} as unknown as RunPredictions

const record = (distanceM: number, seconds: number, startMs: number) => ({
  distanceM,
  seconds,
  activity: makeActivity({ id: `r${distanceM}`, sport: 'run', startMs }),
})

describe('ranBests', () => {
  it('keeps the recorded bests that beat their prediction, dated by their day, and not one within the spread', () => {
    const ran = ranBests(
      found,
      [
        record(5000, 1230, new Date(2026, 9, 1, 8).getTime()),
        record(10000, 2407, new Date(2026, 10, 27, 8).getTime()),
      ],
      OPENED,
    )
    expect(ran).toEqual([{ distanceM: 10000, seconds: 2407, side: 'faster', when: '27 Nov' }])
    expect(ranText(ran[0]!)).toBe('You ran 40:07 on 27 Nov')
  })

  it('adds the year to a day outside the year the page opened in, and ignores a tie or a missing distance', () => {
    const earlier = ranBests(
      found,
      [record(5000, 1100, new Date(2025, 11, 28, 8).getTime())],
      OPENED,
    )
    expect(earlier[0]!.when).toBe('28 Dec 2025')
    expect(ranBests(found, [record(10000, 2443, OPENED)], OPENED)).toEqual([])
    expect(ranBests(found, [record(10000, 2560, OPENED)], OPENED)).toEqual([])
    expect(ranBests(found, [], OPENED)).toEqual([])
  })

  it('marks a best slower than the top of the spread, in words that say it is slower', () => {
    const slower = ranBests(found, [record(5000, 1291, new Date(2026, 10, 2, 8).getTime())], OPENED)
    expect(slower).toEqual([{ distanceM: 5000, seconds: 1291, side: 'slower', when: '2 Nov' }])
    expect(ranText(slower[0]!)).toBe('Your best is 21:31, from 2 Nov, slower than this spread')
  })
})
