import { describe, expect, it } from 'vitest'
import { DAY_MS, HEADLINE_DURATION_S, THRESHOLD_HOLD_S } from '../constants'
import type { AthleteSettings } from '../types'
import { judgeHeartRate } from './setAside'
import { FLOOR_WINDOW_DAYS, floorAt } from './thresholdFloor'
import type { FloorEffort } from './thresholdTimelineTypes'
import { FIRST_MONDAY_MS, shortRun, weeklyRuns } from './test/runLibrary'

const SETTINGS: AthleteSettings = { massKg: 70, bikeMassKg: 9 }
const T = Date.UTC(2026, 5, 1, 12)

/** An effort `daysAgo` days before T (negative: after it), with its best 30 and 20 minutes. */
const effort = (daysAgo: number, hold: number | null, headline: number | null): FloorEffort => [
  T - daysAgo * DAY_MS,
  hold ?? 0,
  headline ?? 0,
]

describe('floorAt', () => {
  it('takes the best 30 minutes in the 12 months up to the date, and no effort from before or after them', () => {
    const efforts = [
      effort(800, 20, 21),
      effort(300, 14, 15),
      effort(100, 15, 16),
      effort(-10, 30, 31),
    ]
    // The effort 800 days ago is a better one, and so is the one ten days on; neither is in the year up to T.
    expect(floorAt(efforts, T, false)).toEqual({
      durationS: THRESHOLD_HOLD_S,
      value: 15,
      asOfMs: T - 100 * DAY_MS,
    })
    // Ten days on, the later effort is in; ten days before the year ended, the old one was.
    expect(floorAt(efforts, T + 20 * DAY_MS, false)?.value).toBe(30)
    expect(floorAt(efforts, T - 790 * DAY_MS - 1, false)?.value).toBe(20)
  })

  it('keeps an effort exactly a year back and drops one a millisecond older', () => {
    const edge = effort(FLOOR_WINDOW_DAYS, 12, null)
    expect(floorAt([edge], T, false)?.asOfMs).toBe(edge[0])
    expect(floorAt([[edge[0] - 1, 12, 0]], T, false)).toBeNull()
  })

  it('takes the best 20 minutes only where no effort of the window has a 30', () => {
    const only20 = [effort(200, null, 13), effort(100, null, 12)]
    expect(floorAt(only20, T, false)).toEqual({
      durationS: HEADLINE_DURATION_S,
      value: 13,
      asOfMs: T - 200 * DAY_MS,
    })
    // One 30 minute effort, however much lower than the 20s, is what the floor is taken from.
    const mixed = [...only20, effort(50, 9, 10)]
    expect(floorAt(mixed, T, false)).toMatchObject({ durationS: THRESHOLD_HOLD_S, value: 9 })
  })

  it('has none for a date in the past without an effort in the year before it', () => {
    const efforts = [effort(900, 20, 21), effort(500, 18, 19)]
    expect(floorAt(efforts, T, false)).toBeNull()
  })

  it('lets only the current zones stand on the newest older effort, with the best of the year ending with it', () => {
    const efforts = [effort(900, 20, 21), effort(520, 11, 12), effort(500, 14, 15)]
    // The year before T holds nothing. The newest effort is 500 days ago; the year ending with it holds the other two.
    expect(floorAt(efforts, T, true)).toEqual({
      durationS: THRESHOLD_HOLD_S,
      value: 14,
      asOfMs: T - 500 * DAY_MS,
    })
  })

  it('has none with no effort at all, current or not', () => {
    expect(floorAt([], T, false)).toBeNull()
    expect(floorAt([], T, true)).toBeNull()
    expect(floorAt([effort(-5, 10, 11)], T, true)).toBeNull()
  })
})

describe('the efforts a library gives a floor', () => {
  it('holds each run with a 20 minute effort, oldest first, and leaves out a run without one', () => {
    const library = [...weeklyRuns(0, 8, () => 1), shortRun('quick', 80, 1)]
    const { floor } = judgeHeartRate(library, SETTINGS)
    expect(floor.run).toHaveLength(8)
    expect(floor.run[0]![0]).toBe(FIRST_MONDAY_MS + 2 * DAY_MS)
    expect(floor.run.map((each) => each[0])).toEqual(
      [...floor.run.map((each) => each[0])].sort((a, b) => a - b),
    )
    // A run at level 1 holds 14 W/kg and 900 J/kg above it: the mean over 30 minutes and over 20, to four decimals.
    expect(floor.run[0]![1]).toBeCloseTo(14 + 900 / THRESHOLD_HOLD_S, 4)
    expect(floor.run[0]![2]).toBeCloseTo(14 + 900 / HEADLINE_DURATION_S, 4)
    expect(floor.ride).toEqual([])
  })
})
